import { afterEach, describe, expect, mock, test } from "bun:test";

type ServiceRow =
  | {
      tcpProxyPort: number | null;
      serviceType: "app" | "database";
    }
  | undefined;

type DeploymentRow =
  | {
      id: string;
      hostPort: number | null;
    }
  | undefined;

type ReplicaRow =
  | {
      hostPort: number | null;
    }
  | undefined;

type JsonCall = {
  body: unknown;
  init: { status?: number } | undefined;
};

type SetupCall = {
  serviceId: string;
  port: number;
};

const state: {
  service: ServiceRow;
  deployment: DeploymentRow;
  replica: ReplicaRow;
} = {
  service: undefined,
  deployment: undefined,
  replica: undefined,
};

const jsonCalls: JsonCall[] = [];
const setupCalls: SetupCall[] = [];
const removeCalls: string[] = [];

function resetState() {
  state.service = undefined;
  state.deployment = undefined;
  state.replica = undefined;
  jsonCalls.length = 0;
  setupCalls.length = 0;
  removeCalls.length = 0;
}

function buildSelectQuery(table: string) {
  const query = {
    select: function select() {
      return query;
    },
    where: function where() {
      return query;
    },
    orderBy: function orderBy() {
      return query;
    },
    limit: function limit() {
      return query;
    },
    executeTakeFirst: async function executeTakeFirst() {
      if (table === "services") {
        return state.service;
      }
      if (table === "deployments") {
        return state.deployment;
      }
      if (table === "replicas") {
        return state.replica;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return query;
}

mock.module("next/server", function () {
  return {
    NextResponse: {
      json: function json(body: unknown, init?: { status?: number }) {
        jsonCalls.push({ body, init });
        return { body, init };
      },
    },
  };
});

mock.module("@/lib/db", function () {
  return {
    db: {
      selectFrom: function selectFrom(table: string) {
        return buildSelectQuery(table);
      },
    },
  };
});

mock.module("@/lib/tcp-proxy", function () {
  return {
    removeTcpProxy: async function removeTcpProxy(serviceId: string) {
      removeCalls.push(serviceId);
    },
    setupTcpProxy: async function setupTcpProxy(
      serviceId: string,
      port: number,
    ) {
      setupCalls.push({ serviceId, port });
    },
  };
});

async function callPostRoute(serviceId = "svc-1") {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/services/svc-1/tcp-proxy"), {
    params: Promise.resolve({ id: serviceId }),
  });
}

async function callGetRoute(serviceId = "svc-1") {
  const { GET } = await import("./route");
  return GET(new Request("http://localhost/api/services/svc-1/tcp-proxy"), {
    params: Promise.resolve({ id: serviceId }),
  });
}

afterEach(function () {
  resetState();
});

describe("tcp proxy route", function () {
  test("POST uses running replica hostPort when available", async function () {
    state.service = { tcpProxyPort: null, serviceType: "database" };
    state.deployment = { id: "dep-1", hostPort: 15000 };
    state.replica = { hostPort: 16000 };

    await callPostRoute();

    expect(setupCalls).toEqual([{ serviceId: "svc-1", port: 16000 }]);
    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ enabled: true, port: 16000 });
  });

  test("POST falls back to deployment hostPort when no replica exists", async function () {
    state.service = { tcpProxyPort: null, serviceType: "database" };
    state.deployment = { id: "dep-1", hostPort: 15000 };
    state.replica = undefined;

    await callPostRoute();

    expect(setupCalls).toEqual([{ serviceId: "svc-1", port: 15000 }]);
    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({ enabled: true, port: 15000 });
  });

  test("GET returns replica hostPort when available", async function () {
    state.service = { tcpProxyPort: 16000, serviceType: "database" };
    state.deployment = { id: "dep-1", hostPort: 15000 };
    state.replica = { hostPort: 17000 };

    await callGetRoute();

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.body).toEqual({
      enabled: true,
      port: 16000,
      hostPort: 17000,
    });
  });
});
