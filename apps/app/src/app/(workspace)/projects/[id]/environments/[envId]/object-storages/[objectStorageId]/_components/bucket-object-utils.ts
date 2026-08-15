export function formatObjectSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const unit = units[unitIndex] ?? "TB";
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

export function formatObjectDate(timestamp: number | null): string {
  if (timestamp === null) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function normalizePrefixInput(prefix: string): string {
  return prefix.trim().replace(/^\/+/, "");
}

export function buildObjectKey(prefix: string, fileName: string): string {
  const normalizedPrefix = normalizePrefixInput(prefix);
  const normalizedFileName = fileName.trim().replace(/^\/+/, "");

  if (!normalizedPrefix) {
    return normalizedFileName;
  }

  return `${normalizedPrefix.replace(/\/?$/, "/")}${normalizedFileName}`;
}
