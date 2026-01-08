import { NextResponse } from "next/server";
import { deployService } from "@/lib/deployer";
import { getGitHubAppCredentials } from "@/lib/github";
import {
  findMatchingServices,
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
