import { describe, expect, test } from "bun:test";

interface DomainRoute {
  domain: string;
  type: "proxy" | "redirect" | "frost-admin";
  hostPort?: number;
  redirectTarget?: string;
  redirectCode?: number;
  requestTimeout?: number;
}

function buildCaddyConfig(
  routes: DomainRoute[],
  email: string,
  staging: boolean,
) {
  const httpsRoutes: unknown[] = [];
  const allDomains: string[] = [];

  for (const route of routes) {
    allDomains.push(route.domain);

    if (route.type === "frost-admin" || route.type === "proxy") {
      const dial =
        route.type === "frost-admin"
          ? "localhost:3000"
          : `localhost:${route.hostPort}`;

      const reverseProxyHandler: Record<string, unknown> = {
        handler: "reverse_proxy",
        upstreams: [{ dial }],
      };

      if (route.requestTimeout) {
        reverseProxyHandler.transport = {
          protocol: "http",
          response_header_timeout: route.requestTimeout * 1_000_000_000,
        };
      }

      httpsRoutes.push({
        match: [{ host: [route.domain] }],
        handle: [reverseProxyHandler],
      });
    }
  }

  return { httpsRoutes, allDomains };
}

describe("buildCaddyConfig", () => {
  test("generates reverse proxy without timeout when not set", () => {
    const routes: DomainRoute[] = [
      { domain: "app.example.com", type: "proxy", hostPort: 10001 },
    ];

    const { httpsRoutes } = buildCaddyConfig(routes, "test@example.com", false);

    const handler = (httpsRoutes[0] as any).handle[0];
    expect(handler.handler).toBe("reverse_proxy");
    expect(handler.upstreams[0].dial).toBe("localhost:10001");
    expect(handler.transport).toBeUndefined();
  });

  test("adds transport timeout when requestTimeout is set", () => {
    const routes: DomainRoute[] = [
      {
        domain: "app.example.com",
        type: "proxy",
        hostPort: 10001,
        requestTimeout: 300,
      },
    ];

    const { httpsRoutes } = buildCaddyConfig(routes, "test@example.com", false);

    const handler = (httpsRoutes[0] as any).handle[0];
    expect(handler.handler).toBe("reverse_proxy");
    expect(handler.transport).toBeDefined();
    expect(handler.transport.protocol).toBe("http");
    expect(handler.transport.response_header_timeout).toBe(300_000_000_000);
  });

  test("converts seconds to nanoseconds correctly", () => {
    const routes: DomainRoute[] = [
      {
        domain: "app.example.com",
        type: "proxy",
        hostPort: 10001,
        requestTimeout: 60,
      },
    ];

    const { httpsRoutes } = buildCaddyConfig(routes, "test@example.com", false);

    const handler = (httpsRoutes[0] as any).handle[0];
    expect(handler.transport.response_header_timeout).toBe(60_000_000_000);
  });

  test("frost-admin routes use localhost:3000", () => {
    const routes: DomainRoute[] = [
      { domain: "frost.example.com", type: "frost-admin" },
    ];

    const { httpsRoutes } = buildCaddyConfig(routes, "test@example.com", false);

    const handler = (httpsRoutes[0] as any).handle[0];
    expect(handler.upstreams[0].dial).toBe("localhost:3000");
  });
});
