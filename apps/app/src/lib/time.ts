function padTimePart(value: number): string {
  return String(value).padStart(2, "0");
}

function toValidDate(value: number | string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDatePart(date: Date): string {
  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;
}

function formatTimePart(date: Date): string {
  return `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`;
}

function formatTimeOfDayPart(date: Date): string {
  return `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
}

export function formatDateTime(
  value: number | string | Date,
  fallback = "-",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;

  return `${formatDatePart(date)} ${formatTimePart(date)}`;
}

export function formatTimeOfDay(
  value: number | string | Date,
  fallback = "-",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;

  return formatTimeOfDayPart(date);
}

export function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(startMs: number, endMs: number): string {
  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
