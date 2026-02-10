import { afterEach, describe, expect, mock, test } from "bun:test";

type ReplicaRow = {
  containerId: string | null;
  replicaIndex: number;
  status: string;
};

type UpdateCall = {
  table: string;
  values: Record<string, unknown>;
  where: Array<{ column: string; op: string; value: unknown }>;
};

const state: {
  replicas: ReplicaRow[];
  containerStatuses: Record<string, string>;
  statusChecks: string[];
  updates: UpdateCall[];
} = {
  replicas: [],
  containerStatuses: {},
  statusChecks: [],
  updates: [],
};

function resetState() {
  state.replicas = [];
  state.containerStatuses = {};
  state.statusChecks = [];
  state.updates = [];
}

function buildReplicaQuery() {
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
    execute: async function execute() {
      return state.replicas
        .filter((r) => r.status === "running" && r.containerId !== null)
        .sort((a, b) => a.replicaIndex - b.replicaIndex)
        .map((r) => ({ containerId: r.containerId }));
    },
  };

  return query;
}

function buildUpdateQuery(table: string) {
  const call: UpdateCall = { table, values: {}, where: [] };
  const query = {
    set: function set(values: Record<string, unknown>) {
      call.values = values;
      return query;
    },
    where: function where(column: string, op: string, value: unknown) {
      call.where.push({ column, op, value });
      return query;
    },
    execute: async function execute() {
      state.updates.push(call);
    },
  };

  return query;
}

mock.module("./db", () => ({
  db: {
    selectFrom: function selectFrom(table: string) {
      if (table === "replicas") {
        return buildReplicaQuery();
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    updateTable: function updateTable(table: string) {
      return buildUpdateQuery(table);
    },
  },
}));

mock.module("./docker", () => ({
  getContainerStatus: async function getContainerStatus(containerId: string) {
    state.statusChecks.push(containerId);
    return state.containerStatuses[containerId] ?? "unknown";
  },
}));

async function reconcile(input: Record<string, unknown>) {
  const { reconcileDeploymentRuntimeStatus } = await import(
    "./deployment-runtime"
  );
  return reconcileDeploymentRuntimeStatus(input as any);
}

function makeDeployment(overrides?: Record<string, unknown>) {
  return {
    id: "dep-1",
    serviceId: "svc-1",
    status: "running",
    containerId: "ctr-primary",
    finishedAt: null,
    ...(overrides ?? {}),
  };
}

afterEach(() => {
  resetState();
});

describe("reconcileDeploymentRuntimeStatus", () => {
  test("keeps deployment running when any replica is live", async () => {
    state.replicas = [
      { containerId: "ctr-0", replicaIndex: 0, status: "running" },
      { containerId: "ctr-1", replicaIndex: 1, status: "running" },
    ];
    state.containerStatuses = {
      "ctr-0": "exited",
      "ctr-1": "running",
    };

    const result = await reconcile(makeDeployment());

    expect(result?.status).toBe("running");
    expect(state.statusChecks).toEqual(["ctr-0", "ctr-1"]);
    expect(state.updates).toHaveLength(0);
  });

  test("marks deployment stopped when all replicas are not live", async () => {
    state.replicas = [
      { containerId: "ctr-0", replicaIndex: 0, status: "running" },
      { containerId: "ctr-1", replicaIndex: 1, status: "running" },
    ];
    state.containerStatuses = {
      "ctr-0": "exited",
      "ctr-1": "dead",
    };

    const result = await reconcile(makeDeployment());

    expect(result?.status).toBe("stopped");
    expect(state.statusChecks).toEqual(["ctr-0", "ctr-1"]);
    expect(state.updates).toHaveLength(2);
    expect(state.updates.map((u) => u.table)).toEqual([
      "deployments",
      "services",
    ]);

    const deploymentsUpdate = state.updates[0];
    expect(deploymentsUpdate.values.status).toBe("stopped");
    expect(typeof deploymentsUpdate.values.finishedAt).toBe("number");

    const servicesUpdate = state.updates[1];
    expect(servicesUpdate.values.currentDeploymentId).toBe(null);
  });

  test("keeps deployment running when replica status is unknown", async () => {
    state.replicas = [
      { containerId: "ctr-0", replicaIndex: 0, status: "running" },
    ];
    state.containerStatuses = {
      "ctr-0": "unknown",
    };

    const result = await reconcile(makeDeployment());

    expect(result?.status).toBe("running");
    expect(state.statusChecks).toEqual(["ctr-0"]);
    expect(state.updates).toHaveLength(0);
  });

  test("falls back to primary container when replicas are absent", async () => {
    state.containerStatuses = {
      "ctr-primary": "running",
    };

    const result = await reconcile(makeDeployment());

    expect(result?.status).toBe("running");
    expect(state.statusChecks).toEqual(["ctr-primary"]);
    expect(state.updates).toHaveLength(0);
  });

  test("marks deployment stopped when fallback primary container is not live", async () => {
    state.containerStatuses = {
      "ctr-primary": "exited",
    };

    const result = await reconcile(makeDeployment());

    expect(result?.status).toBe("stopped");
    expect(state.statusChecks).toEqual(["ctr-primary"]);
    expect(state.updates).toHaveLength(2);
    expect(state.updates.map((u) => u.table)).toEqual([
      "deployments",
      "services",
    ]);
  });
});
