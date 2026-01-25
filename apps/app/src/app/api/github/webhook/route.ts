import { NextResponse } from "next/server";
import { getSetting } from "@/lib/auth";
import { deployService } from "@/lib/deployer";
import {
  createPRComment,
  getGitHubAppCredentials,
  updatePRComment,
} from "@/lib/github";
import { slugify } from "@/lib/slugify";
import {
  buildPRCommentBody,
  cloneServiceToEnvironment,
  createPreviewEnvironment,
  deletePreviewEnvironment,
  findMatchingServices,
  findPreviewEnvironment,
  findProductionServicesForRepo,
  getEnvironmentServiceStatuses,
  hasExistingDeployment,
  type ServiceDeployStatus,
  updateEnvironmentPRCommentId,
  updatePreviewEnvironmentName,
  verifyWebhookSignature,
} from "@/lib/webhook";

interface PushPayload {
  ref: string;
  after: string;
  repository: {
    default_branch: string;
    clone_url: string;
    html_url: string;
  };
  head_commit: {
    message: string;
  } | null;
}

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    head: {
      ref: string;
      sha: string;
    };
  };
  repository: {
    clone_url: string;
  };
}

export async function POST(request: Request) {
  const creds = await getGitHubAppCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "GitHub App not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("X-Hub-Signature-256");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const event = request.headers.get("X-GitHub-Event");
  if (!event) {
    return NextResponse.json({ error: "Missing event type" }, { status: 400 });
  }

  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature, creds.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event === "ping") {
    return NextResponse.json({ message: "pong" });
  }

  if (event === "pull_request") {
    return handlePullRequest(rawBody);
  }

  if (event !== "push") {
    return NextResponse.json({ message: `Ignored event: ${event}` });
  }

  return handlePush(rawBody);
}

async function handlePush(rawBody: string) {
  const payload: PushPayload = JSON.parse(rawBody);
  const { ref, repository } = payload;
  const branch = ref.replace("refs/heads/", "");
  const isDefaultBranch = branch === repository.default_branch;

  if (isDefaultBranch) {
    return handleProductionPush(payload);
  }

  return handleBranchPush(payload);
}

async function handleProductionPush(payload: PushPayload) {
  const { after: commitSha, repository, head_commit } = payload;

  const matchedServices = await findMatchingServices(repository.clone_url);

  if (matchedServices.length === 0) {
    return NextResponse.json({
      message: "No matching services found",
    });
  }

  const commitMessage = head_commit?.message || null;
  const deploymentIds: string[] = [];

  for (const service of matchedServices) {
    if (await hasExistingDeployment(service.id, commitSha)) {
      console.log(
        `Skipping deployment for service ${service.id}: existing deployment with same commit`,
      );
      continue;
    }

    try {
      const deploymentId = await deployService(service.id, {
        commitSha,
        commitMessage: commitMessage || undefined,
      });
      deploymentIds.push(deploymentId);
    } catch (err) {
      console.error(`Failed to deploy service ${service.id}:`, err);
    }
  }

  return NextResponse.json({
    message: `Triggered ${deploymentIds.length} deployment(s)`,
    deployments: deploymentIds,
  });
}

async function handleBranchPush(_payload: PushPayload) {
  return NextResponse.json({
    message: "Branch pushes do not create previews, open a PR instead",
  });
}

async function handlePullRequest(rawBody: string) {
  const payload: PullRequestPayload = JSON.parse(rawBody);
  const { action, number: prNumber, pull_request, repository } = payload;

  if (action !== "opened" && action !== "synchronize" && action !== "closed") {
    return NextResponse.json({
      message: `Ignored pull_request action: ${action}`,
    });
  }

  const productionServices = await findProductionServicesForRepo(
    repository.clone_url,
  );

  if (productionServices.length === 0) {
    return NextResponse.json({
      message: "No matching production services found",
    });
  }

  const projectId = productionServices[0].projectId;
  const projectHostname =
    productionServices[0].projectHostname ?? slugify(projectId);
  const branch = pull_request.head.ref;
  const prTitle = pull_request.title;
  const commitSha = pull_request.head.sha;

  if (action === "closed") {
    const deleted = await deletePreviewEnvironment(projectId, prNumber);
    return NextResponse.json({
      message: deleted
        ? `Deleted preview environment for PR #${prNumber}`
        : `No preview environment found for PR #${prNumber}`,
    });
  }

  if (action === "synchronize") {
    await updatePreviewEnvironmentName(projectId, prNumber, prTitle);
  }

  const environmentId = await createPreviewEnvironment(
    projectId,
    prNumber,
    branch,
    prTitle,
  );
  const envName = slugify(prTitle).substring(0, 50);

  const deploymentIds: string[] = [];
  const serviceStatuses: ServiceDeployStatus[] = [];

  for (const service of productionServices) {
    const clonedServiceId = await cloneServiceToEnvironment(service, {
      environmentId,
      projectHostname,
      envName,
      targetBranch: branch,
    });

    if (await hasExistingDeployment(clonedServiceId, commitSha)) {
      console.log(
        `Skipping deployment for service ${clonedServiceId}: existing deployment with same commit`,
      );
      const existingStatuses =
        await getEnvironmentServiceStatuses(environmentId);
      const existing = existingStatuses.find((s) => s.name === service.name);
      if (existing) {
        serviceStatuses.push(existing);
      }
      continue;
    }

    const hostname = service.hostname ?? slugify(service.name);
    try {
      const deploymentId = await deployService(clonedServiceId, {
        commitSha,
        commitMessage: `PR #${prNumber}: ${prTitle}`,
      });
      deploymentIds.push(deploymentId);
      serviceStatuses.push({
        id: clonedServiceId,
        name: service.name,
        hostname,
        status: "deploying",
        url: null,
      });
    } catch (err) {
      console.error(`Failed to deploy service ${clonedServiceId}:`, err);
      serviceStatuses.push({
        id: clonedServiceId,
        name: service.name,
        hostname,
        status: "failed",
        url: null,
      });
    }
  }

  const [env, frostDomain] = await Promise.all([
    findPreviewEnvironment(projectId, prNumber),
    getSetting("domain"),
  ]);
  const body = buildPRCommentBody({
    services: serviceStatuses,
    branch,
    commitSha,
    projectId,
    environmentId,
    frostDomain,
  });

  try {
    if (env?.prCommentId) {
      await updatePRComment(repository.clone_url, env.prCommentId, body);
    } else {
      const commentId = await createPRComment(
        repository.clone_url,
        prNumber,
        body,
      );
      await updateEnvironmentPRCommentId(environmentId, commentId);
    }
  } catch (err) {
    console.error("Failed to create/update PR comment:", err);
  }

  return NextResponse.json({
    message:
      action === "opened"
        ? `Created preview environment for PR #${prNumber}`
        : `Updated preview environment for PR #${prNumber}`,
    environmentId,
    deployments: deploymentIds,
  });
}
