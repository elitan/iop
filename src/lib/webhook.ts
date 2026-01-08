import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { normalizeGitHubUrl } from "./github";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function shouldTriggerDeploy(
  ref: string,
  defaultBranch: string,
): boolean {
  const expectedRef = `refs/heads/${defaultBranch}`;
  return ref === expectedRef;
}

export async function findMatchingServices(webhookRepoUrl: string) {
  const normalizedWebhookUrl = normalizeGitHubUrl(webhookRepoUrl);

  const services = await db
    .selectFrom("services")
    .selectAll()
    .where("deployType", "=", "repo")
    .where("autoDeploy", "=", 1)
    .execute();

  return services.filter((service) => {
    if (!service.repoUrl) return false;
    return normalizeGitHubUrl(service.repoUrl) === normalizedWebhookUrl;
  });
}

export async function hasExistingDeployment(
  serviceId: string,
  commitSha: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom("deployments")
    .select("id")
    .where("serviceId", "=", serviceId)
    .where("commitSha", "=", commitSha.substring(0, 7))
    .where((eb) =>
      eb.or([
        eb("status", "=", "pending"),
        eb("status", "=", "cloning"),
        eb("status", "=", "building"),
        eb("status", "=", "deploying"),
        eb("status", "=", "running"),
      ]),
    )
    .executeTakeFirst();

  return !!existing;
}
