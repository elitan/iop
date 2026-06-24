export const SYSTEM_API_KEY_NAME_PREFIX = "system:";
export const CLEANUP_API_KEY_NAME = `${SYSTEM_API_KEY_NAME_PREFIX}cleanup`;

export function isSystemApiKeyName(name: string): boolean {
  return name.startsWith(SYSTEM_API_KEY_NAME_PREFIX);
}
