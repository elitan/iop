import { afterEach, describe, expect, mock, test } from "bun:test";

type DeploymentRow =
  | {
      containerId: string | null;
      status: string;
    }
  | undefined;

type ReplicaRow = {
  containerId: string | null;
  replicaIndex: number;
};

type StreamCall = {
  containerId: string;
  tail: number | undefined;
  timestamps: boolean | undefined;
};

const state: {
  deployment: DeploymentRow;
  replicas: ReplicaRow[];
} = {
  deployment: undefined,
  replicas: [],
};

const streamCalls: StreamCall[] = [];

function resetState() {
  state.deployment = undefined;
  state.replicas = [];
  streamCalls.length = 0;
}

function buildDeploymentQuery() {
  const query = {
    select: function select() {
      return query;
    },
    where: function where() {
      return query;
    },
    executeTakeFirst: async function executeTakeFirst() {
      return state.deployment;
    },
  };

  return query;
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
      return state.replicas;
    },
  };

  return query;
}

mock.module("@/lib/db", () => ({
  db: {
    selectFrom: function selectFrom(table: string) {
      if (table === "deployments") {
        return buildDeploymentQuery();
      }
      if (table === "replicas") {
        return buildReplicaQuery();
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

mock.module("@/lib/docker", () => ({
  streamContainerLogs: function streamContainerLogs(
    containerId: string,
    options: {
      tail?: number;
      timestamps?: boolean;
      onData: (line: string) => void;
      onError: (err: Error) => void;
      onClose: () => void;
    },
  ) {
    streamCalls.push({
      containerId,
      tail: options.tail,
      timestamps: options.timestamps,
    });
    return {
      stop: function stop() {},
    };
  },
}));

async function callRoute(url: string) {
  const { GET } = await import("./route");
  return GET(new Request(url), {
    params: Promise.resolve({ id: "dep-1" }),
  });
}

afterEach(() => {
  resetState();
});

describe("deployment logs route", () => {
  test("returns 404 when deployment is missing", async () => {
    const response = await callRoute(
      "http://localhost/api/deployments/dep-1/logs",
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Deployment not found");
    expect(streamCalls).toHaveLength(0);
  });

  test("streams logs for failed deployment", async () => {
    state.deployment = {
      containerId: "ctr-failed-1",
      status: "failed",
    };

    const response = await callRoute(
      "http://localhost/api/deployments/dep-1/logs?tail=50",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(streamCalls).toEqual([
      {
        containerId: "ctr-failed-1",
        tail: 50,
        timestamps: true,
      },
    ]);
  });
});
