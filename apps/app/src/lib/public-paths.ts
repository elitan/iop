const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth/dev-info",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/setup",
  "/api/dev/reset-setup",
  "/api/health",
  "/api/github/webhook",
  "/api/openapi.json",
  "/api/docs",
  "/.well-known/",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(function matchesPublicPath(path) {
    return (
      pathname === path || (path.endsWith("/") && pathname.startsWith(path))
    );
  });
}
