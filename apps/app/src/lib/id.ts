import { customAlphabet } from "nanoid";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_SIZE = 20;
const generateRandomId = customAlphabet(ID_ALPHABET, ID_SIZE);

function buildId(prefix: string): string {
  return `${prefix}_${generateRandomId()}`;
}

export function newProjectId(): string {
  return buildId("proj");
}

export function newEnvironmentId(): string {
  return buildId("env");
}

export function newServiceId(): string {
  return buildId("svc");
}

export function newDeploymentId(): string {
  return buildId("dep");
}

export function newDomainId(): string {
  return buildId("dom");
}

export function newRegistryId(): string {
  return buildId("reg");
}

export function newApiKeyId(): string {
  return buildId("key");
}

export function newReplicaId(): string {
  return buildId("rep");
}

export function newDatabaseId(): string {
  return buildId("db");
}

export function newDatabaseTargetId(): string {
  return buildId("dbt");
}

export function newDatabaseTargetDeploymentId(): string {
  return buildId("dtd");
}

export function newDatabaseImportJobId(): string {
  return buildId("dbi");
}

export function newEnvironmentDatabaseAttachmentId(): string {
  return buildId("att");
}

export function newServiceDatabaseBindingId(): string {
  return buildId("bind");
}

export function newGithubInstallationId(): string {
  return buildId("ghinst");
}

export function newOauthClientId(): string {
  return buildId("oauthc");
}

export function newOauthCodeId(): string {
  return buildId("oauthcode");
}

export function newOauthTokenId(): string {
  return buildId("oauthtok");
}

export function newRuntimeServiceId(): string {
  return buildId("rtsvc");
}

export function hasIdPrefix(value: string, prefix: string): boolean {
  return value.startsWith(`${prefix}_`);
}
