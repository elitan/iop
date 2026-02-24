function normalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function hashAlias(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function clampAlias(value: string): string {
  const normalized = normalizeAlias(value);
  if (normalized.length === 0) {
    return "db";
  }
  if (normalized.length <= 63) {
    return normalized;
  }

  const hash = hashAlias(normalized).slice(0, 8);
  const suffix = `-${hash}`;
  const head = normalized
    .slice(0, Math.max(1, 63 - suffix.length))
    .replace(/-+$/g, "");
  return `${head}${suffix}`.slice(0, 63);
}

export function getDatabaseBranchAlias(
  databaseName: string,
  branchName: string,
): string {
  return clampAlias(`${databaseName}--${branchName}`);
}

export function getDatabaseBranchInternalHost(
  databaseName: string,
  branchName: string,
): string {
  return `${getDatabaseBranchAlias(databaseName, branchName)}.frost.internal`;
}
