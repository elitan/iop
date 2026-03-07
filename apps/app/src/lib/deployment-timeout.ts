const DEFAULT_DEPLOY_TIMEOUT_MS = 30 * 60 * 1000;
const MIN_DEPLOY_TIMEOUT_MS = 1000;

function parseTimeoutEnv(
  name: string,
  fallback: number,
  minimum: number,
): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(value, minimum);
}

function formatDeployTimeout(timeoutMs: number): string {
  if (timeoutMs % (60 * 1000) === 0) {
    const minutes = timeoutMs / (60 * 1000);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const seconds = Math.ceil(timeoutMs / 1000);
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function getDeployTimeoutMs(): number {
  return parseTimeoutEnv(
    "FROST_DEPLOY_TIMEOUT_MS",
    DEFAULT_DEPLOY_TIMEOUT_MS,
    MIN_DEPLOY_TIMEOUT_MS,
  );
}

export function getDeployTimeoutError(
  timeoutMs: number = getDeployTimeoutMs(),
): string {
  return `Deployment exceeded max time of ${formatDeployTimeout(timeoutMs)}`;
}

export function getRemainingDeployTimeoutMs(
  startedAt: number,
  timeoutMs: number = getDeployTimeoutMs(),
): number {
  return timeoutMs - (Date.now() - startedAt);
}

export function getRequiredRemainingDeployTimeoutMs(
  startedAt: number,
  timeoutMs: number = getDeployTimeoutMs(),
): number {
  const remainingMs = getRemainingDeployTimeoutMs(startedAt, timeoutMs);
  if (remainingMs <= 0) {
    throw new Error(getDeployTimeoutError(timeoutMs));
  }
  return remainingMs;
}

export function createRemainingDeployTimeoutMsGetter(
  startedAt: number,
  timeoutMs: number = getDeployTimeoutMs(),
): () => number {
  return function getRemainingTimeoutMs(): number {
    return getRequiredRemainingDeployTimeoutMs(startedAt, timeoutMs);
  };
}

export function hasDeploymentTimedOut(
  createdAt: number,
  timeoutMs: number = getDeployTimeoutMs(),
): boolean {
  return Date.now() - createdAt >= timeoutMs;
}
