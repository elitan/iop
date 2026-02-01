import { describe, expect, test } from "bun:test";

interface DomainRoute {
  domain: string;
  type: "proxy" | "redirect" | "frost-admin";
  hostPorts: number[];
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
      const upstreams =
        route.type === "frost-admin"
          ? [{ dial: "localhost:3000" }]
          : route.hostPorts.map((p) => ({ dial: `localhost:${p}` }));

      const reverseProxyHandler: Record<string, unknown> = {
        handler: "reverse_proxy",
        upstreams,
      };

      if (upstreams.length > 1) {
        reverseProxyHandler.load_balancing = {
          selection_policy: { policy: "round_robin" },
        };
      }

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

function buildAndGetHandler(routes: DomainRoute[]): Record<string, any> {
  const { httpsRoutes } = buildCaddyConfig(routes, "test@example.com", false);
  return (httpsRoutes[0] as any).handle[0];
}

function proxyRoute(overrides: Partial<DomainRoute> = {}): DomainRoute[] {
  return [
    {
      domain: "app.example.com",
      type: "proxy",
      hostPorts: [10001],
      ...overrides,
    },
  ];
}

describe("buildCaddyConfig", () => {
  test("generates reverse proxy without timeout when not set", () => {
    const handler = buildAndGetHandler(proxyRoute());
    expect(handler.handler).toBe("reverse_proxy");
    expect(handler.upstreams[0].dial).toBe("localhost:10001");
    expect(handler.transport).toBeUndefined();
  });

  test("adds transport timeout when requestTimeout is set", () => {
    const handler = buildAndGetHandler(proxyRoute({ requestTimeout: 300 }));
    expect(handler.handler).toBe("reverse_proxy");
    expect(handler.transport).toBeDefined();
    expect(handler.transport.protocol).toBe("http");
    expect(handler.transport.response_header_timeout).toBe(300_000_000_000);
  });

  test("converts seconds to nanoseconds correctly", () => {
    const handler = buildAndGetHandler(proxyRoute({ requestTimeout: 60 }));
    expect(handler.transport.response_header_timeout).toBe(60_000_000_000);
  });

  test("frost-admin routes use localhost:3000", () => {
    const handler = buildAndGetHandler([
      { domain: "frost.example.com", type: "frost-admin", hostPorts: [] },
    ]);
    expect(handler.upstreams[0].dial).toBe("localhost:3000");
  });

  test("multiple upstreams for multi-replica", () => {
    const handler = buildAndGetHandler(
      proxyRoute({ hostPorts: [10001, 10002, 10003] }),
    );
    expect(handler.upstreams).toHaveLength(3);
    expect(handler.upstreams[0].dial).toBe("localhost:10001");
    expect(handler.upstreams[1].dial).toBe("localhost:10002");
    expect(handler.upstreams[2].dial).toBe("localhost:10003");
  });

  test("round_robin when > 1 upstream", () => {
    const handler = buildAndGetHandler(
      proxyRoute({ hostPorts: [10001, 10002] }),
    );
    expect(handler.load_balancing).toBeDefined();
    expect(handler.load_balancing.selection_policy.policy).toBe("round_robin");
  });

  test("no load_balancing for single upstream", () => {
    const handler = buildAndGetHandler(proxyRoute());
    expect(handler.load_balancing).toBeUndefined();
  });

  test("timeout + multi-upstream combined", () => {
    const handler = buildAndGetHandler(
      proxyRoute({ hostPorts: [10001, 10002], requestTimeout: 60 }),
    );
    expect(handler.transport).toBeDefined();
    expect(handler.transport.response_header_timeout).toBe(60_000_000_000);
    expect(handler.load_balancing).toBeDefined();
    expect(handler.load_balancing.selection_policy.policy).toBe("round_robin");
  });
});
