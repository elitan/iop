const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const DEMO_MODE_LIMITS = {
  maxProjects: 5,
  maxEnvironmentsPerProject: 3,
  maxServicesPerEnvironment: 8,
  maxReplicaCount: 1,
  maxCpuLimit: 2,
  maxMemoryBytes: 2 * 1024 * 1024 * 1024,
  deployWindowMs: 10 * 60 * 1000,
  deploysPerServiceWindow: 10,
  loginWindowMs: 60 * 1000,
  loginMaxAttemptsPerWindow: 30,
} as const;

export function isDemoMode(): boolean {
  const raw = process.env.FROST_DEMO_MODE;
  if (!raw) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

export function getDemoModeBlockedMessage(target: string): string {
  return `${target} disabled in demo mode`;
}

export function isDemoCpuLimitAllowed(cpuLimit?: number | null): boolean {
  if (cpuLimit === null || cpuLimit === undefined) return true;
  return cpuLimit <= DEMO_MODE_LIMITS.maxCpuLimit;
}

export function isDemoMemoryLimitAllowed(memoryLimit?: string | null): boolean {
  if (!memoryLimit) return true;
  const bytes = parseMemoryLimitToBytes(memoryLimit);
  if (bytes === null) return true;
  return bytes <= DEMO_MODE_LIMITS.maxMemoryBytes;
}

function parseMemoryLimitToBytes(value: string): number | null {
  const match = value.trim().match(/^(\d+)([kmg])$/i);
  if (!match) return null;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit === "k") return amount * 1024;
  if (unit === "m") return amount * 1024 * 1024;
  if (unit === "g") return amount * 1024 * 1024 * 1024;
  return null;
}
