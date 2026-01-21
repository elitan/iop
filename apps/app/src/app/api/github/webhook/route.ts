import { NextResponse } from "next/server";
import { deployService } from "@/lib/deployer";
import { getGitHubAppCredentials } from "@/lib/github";
import { slugify } from "@/lib/slugify";
import {
  cloneServiceToEnvironment,
  createPreviewEnvironment,
  deletePreviewEnvironment,
  findMatchingServices,
  findProductionServicesForRepo,
  hasExistingDeployment,
  shouldTriggerDeploy,
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

  const payload: PushPayload = JSON.parse(rawBody);
  const { ref, after: commitSha, repository, head_commit } = payload;

  if (!shouldTriggerDeploy(ref, repository.default_branch)) {
    return NextResponse.json({
      message: `Ignored push to non-default branch: ${ref}`,
    });
  }

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

async function handlePullRequest(rawBody: string) {
  const payload: PullRequestPayload = JSON.parse(rawBody);
  const { action, number: prNumber, pull_request, repository } = payload;
  const branch = pull_request.head.ref;
  const commitSha = pull_request.head.sha;

  if (action === "opened" || action === "reopened" || action === "synchronize") {
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
    const envName = `pr-${prNumber}`;

    const environmentId = await createPreviewEnvironment(
      projectId,
      prNumber,
      branch,
    );

    const deploymentIds: string[] = [];

    for (const service of productionServices) {
      const clonedServiceId = await cloneServiceToEnvironment(service, {
        environmentId,
        projectHostname,
        envName,
        targetBranch: branch,
      });

      try {
        const deploymentId = await deployService(clonedServiceId, {
          commitSha,
          commitMessage: `PR #${prNumber}: ${branch}`,
        });
        deploymentIds.push(deploymentId);
      } catch (err) {
        console.error(`Failed to deploy service ${clonedServiceId}:`, err);
      }
    }

    return NextResponse.json({
      message: `Created preview environment for PR #${prNumber}`,
      environmentId,
      deployments: deploymentIds,
    });
  }

  if (action === "closed") {
    const productionServices = await findProductionServicesForRepo(
      repository.clone_url,
    );

    if (productionServices.length === 0) {
      return NextResponse.json({
        message: "No matching production services found",
      });
    }

    const projectId = productionServices[0].projectId;
    const deleted = await deletePreviewEnvironment(projectId, prNumber);

    return NextResponse.json({
      message: deleted
        ? `Deleted preview environment for PR #${prNumber}`
        : `No preview environment found for PR #${prNumber}`,
    });
  }

  return NextResponse.json({
    message: `Ignored pull_request action: ${action}`,
  });
}
