import { afterEach, describe, expect, test } from "bun:test";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import {
  getDatabaseTargetGatewayActiveConnections,
  startDatabaseTargetGateway,
  stopAllDatabaseTargetGateways,
  stopDatabaseTargetGateway,
} from "./database-target-gateway";

const servers: Server[] = [];

function listenServer(server: Server, port: number): Promise<number> {
  return new Promise(function listenServerPromise(resolve, reject) {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", function onListen() {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server did not bind to a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise(function closeServerPromise(resolve) {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(function onClose() {
      resolve();
    });
  });
}

function connectClient(port: number): Promise<Socket> {
  return new Promise(function connectClientPromise(resolve, reject) {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", function onConnect() {
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

function waitForData(socket: Socket): Promise<Buffer> {
  return new Promise(function waitForDataPromise(resolve, reject) {
    socket.once("data", function onData(chunk: Buffer) {
      resolve(chunk);
    });
    socket.once("error", reject);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise(function waitPromise(resolve) {
    setTimeout(resolve, ms);
  });
}

afterEach(async function cleanup() {
  await stopAllDatabaseTargetGateways();
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await closeServer(server);
    }
  }
});

describe("database target gateway", function describeGateway() {
  test("buffers first bytes and forwards traffic", async function testForwarding() {
    let activityEvents = 0;

    const upstreamServer = createServer(function onConnection(socket) {
      socket.on("data", function onSocketData(chunk) {
        socket.write(chunk);
      });
    });
    servers.push(upstreamServer);
    const upstreamPort = await listenServer(upstreamServer, 0);

    const gatewayProbe = createServer();
    const gatewayPort = await listenServer(gatewayProbe, 0);
    await closeServer(gatewayProbe);

    await startDatabaseTargetGateway({
      targetId: "dbt_test",
      listenPort: gatewayPort,
      ensureRunning: async function ensureRunning() {
        return upstreamPort;
      },
      onActivity: function onActivity() {
        activityEvents += 1;
      },
    });

    const client = await connectClient(gatewayPort);
    client.write("hello");

    const response = await waitForData(client);
    expect(response.toString()).toBe("hello");
    expect(getDatabaseTargetGatewayActiveConnections("dbt_test")).toBe(1);
    expect(activityEvents).toBeGreaterThan(0);

    client.end();
    await wait(30);
    expect(getDatabaseTargetGatewayActiveConnections("dbt_test")).toBe(0);
  });

  test("stop is safe when gateway does not exist", async function testStopMissing() {
    await stopDatabaseTargetGateway("dbt_missing");
    expect(getDatabaseTargetGatewayActiveConnections("dbt_missing")).toBe(0);
  });
});
