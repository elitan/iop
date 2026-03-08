function normalizeValue(value: string | null | undefined): string | null {
  const nextValue = value?.trim();
  if (!nextValue) {
    return null;
  }
  return nextValue;
}

function isLoopbackHost(value: string): boolean {
  return (
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value === "0.0.0.0"
  );
}

export function getDatabasePublicHost(input: {
  appHost: string | null;
  serverIp: string | null;
}): string {
  const appHost = normalizeValue(input.appHost);
  const serverIp = normalizeValue(input.serverIp);

  if (appHost && (!serverIp || isLoopbackHost(serverIp))) {
    return appHost;
  }

  if (serverIp) {
    return serverIp;
  }

  if (appHost) {
    return appHost;
  }

  return "localhost";
}
