import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";

const GATEWAY_START_TIMEOUT_MS = 60_000;
const GATEWAY_BUFFER_LIMIT_BYTES = 1024 * 1024;

interface DatabaseTargetGatewayConfig {
  targetId: string;
  listenPort: number;
  ensureRunning: () => Promise<number>;
  onActivity: () => void;
}

interface DatabaseTargetGatewayEntry {
  targetId: string;
  listenPort: number;
  ensureRunning: () => Promise<number>;
  onActivity: () => void;
  server: Server;
  sockets: Set<Socket>;
  activeConnections: number;
}

const gatewayEntries = new Map<string, DatabaseTargetGatewayEntry>();

function withTimeout<T>(
  input: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise(function withTimeoutPromise(resolve, reject) {
    const timeoutId = setTimeout(function onTimeout() {
      reject(new Error(message));
    }, ms);

    input
      .then(function onResolve(value) {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(function onReject(error) {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function waitForUpstreamConnection(port: number): Promise<Socket> {
  return new Promise(function waitForUpstream(resolve, reject) {
    const socket = createConnection({ host: "127.0.0.1", port });

    const timeoutId = setTimeout(function onTimeout() {
      socket.destroy();
      reject(
        new Error("Gateway timed out while connecting to postgres runtime"),
      );
    }, GATEWAY_START_TIMEOUT_MS);

    socket.once("connect", function onConnect() {
      clearTimeout(timeoutId);
      resolve(socket);
    });

    socket.once("error", function onError(error) {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function decreaseActiveConnections(entry: DatabaseTargetGatewayEntry): void {
  if (entry.activeConnections <= 0) {
    entry.activeConnections = 0;
    return;
  }
  entry.activeConnections -= 1;
}

function handleGatewayConnection(
  entry: DatabaseTargetGatewayEntry,
  clientSocket: Socket,
): void {
  entry.sockets.add(clientSocket);
  entry.activeConnections += 1;

  let upstreamSocket: Socket | null = null;
  let completed = false;
  let bufferedBytes = 0;
  const bufferedChunks: Buffer[] = [];

  function cleanup(): void {
    if (completed) {
      return;
    }
    completed = true;

    entry.sockets.delete(clientSocket);
    if (upstreamSocket) {
      entry.sockets.delete(upstreamSocket);
    }
    decreaseActiveConnections(entry);
  }

  function closeBoth(): void {
    if (!clientSocket.destroyed) {
      clientSocket.destroy();
    }
    if (upstreamSocket && !upstreamSocket.destroyed) {
      upstreamSocket.destroy();
    }
  }

  clientSocket.on("data", function onClientData(chunk: Buffer) {
    entry.onActivity();

    if (!upstreamSocket || upstreamSocket.destroyed) {
      bufferedBytes += chunk.length;
      if (bufferedBytes > GATEWAY_BUFFER_LIMIT_BYTES) {
        closeBoth();
        return;
      }
      bufferedChunks.push(Buffer.from(chunk));
      return;
    }

    if (!upstreamSocket.write(chunk)) {
      clientSocket.pause();
    }
  });

  clientSocket.on("error", function onClientError() {
    closeBoth();
  });
  clientSocket.on("end", function onClientEnd() {
    if (upstreamSocket && !upstreamSocket.destroyed) {
      upstreamSocket.end();
    }
  });
  clientSocket.on("close", function onClientClose() {
    cleanup();
  });

  void (async function bootstrapUpstream(): Promise<void> {
    let upstreamPort: number;
    try {
      upstreamPort = await withTimeout(
        entry.ensureRunning(),
        GATEWAY_START_TIMEOUT_MS,
        "Gateway timed out while starting postgres runtime",
      );
    } catch {
      closeBoth();
      return;
    }

    try {
      upstreamSocket = await waitForUpstreamConnection(upstreamPort);
    } catch {
      closeBoth();
      return;
    }

    if (clientSocket.destroyed || !upstreamSocket) {
      closeBoth();
      return;
    }

    entry.sockets.add(upstreamSocket);

    upstreamSocket.on("data", function onUpstreamData(chunk: Buffer) {
      entry.onActivity();
      if (!clientSocket.write(chunk)) {
        upstreamSocket?.pause();
      }
    });

    upstreamSocket.on("drain", function onUpstreamDrain() {
      clientSocket.resume();
    });

    clientSocket.on("drain", function onClientDrain() {
      upstreamSocket?.resume();
    });

    upstreamSocket.on("error", function onUpstreamError() {
      closeBoth();
    });
    upstreamSocket.on("end", function onUpstreamEnd() {
      clientSocket.end();
    });
    upstreamSocket.on("close", function onUpstreamClose() {
      if (upstreamSocket) {
        entry.sockets.delete(upstreamSocket);
      }
    });

    for (const chunk of bufferedChunks) {
      if (!upstreamSocket.write(chunk)) {
        break;
      }
    }
  })();
}

function closeServer(server: Server): Promise<void> {
  return new Promise(function closeServerPromise(resolve) {
    server.close(function onClose() {
      resolve();
    });
  });
}

export async function startDatabaseTargetGateway(
  config: DatabaseTargetGatewayConfig,
): Promise<void> {
  const existing = gatewayEntries.get(config.targetId);

  if (existing && existing.listenPort === config.listenPort) {
    existing.ensureRunning = config.ensureRunning;
    existing.onActivity = config.onActivity;
    return;
  }

  if (existing) {
    await stopDatabaseTargetGateway(config.targetId);
  }

  const server = createServer(function onConnection(clientSocket) {
    const entry = gatewayEntries.get(config.targetId);
    if (!entry) {
      clientSocket.destroy();
      return;
    }
    handleGatewayConnection(entry, clientSocket);
  });

  await new Promise<void>(function startServer(resolve, reject) {
    server.once("error", reject);
    server.listen(config.listenPort, "0.0.0.0", function onListen() {
      server.off("error", reject);
      resolve();
    });
  });

  gatewayEntries.set(config.targetId, {
    targetId: config.targetId,
    listenPort: config.listenPort,
    ensureRunning: config.ensureRunning,
    onActivity: config.onActivity,
    server,
    sockets: new Set(),
    activeConnections: 0,
  });
}

export async function stopDatabaseTargetGateway(
  targetId: string,
): Promise<void> {
  const entry = gatewayEntries.get(targetId);
  if (!entry) {
    return;
  }

  for (const socket of entry.sockets) {
    if (!socket.destroyed) {
      socket.destroy();
    }
  }

  entry.sockets.clear();
  entry.activeConnections = 0;
  gatewayEntries.delete(targetId);

  if (!entry.server.listening) {
    return;
  }

  await closeServer(entry.server);
}

export async function stopAllDatabaseTargetGateways(): Promise<void> {
  const targetIds = Array.from(gatewayEntries.keys());
  for (const targetId of targetIds) {
    await stopDatabaseTargetGateway(targetId);
  }
}

export function isDatabaseTargetGatewayRunning(targetId: string): boolean {
  return gatewayEntries.has(targetId);
}

export function getDatabaseTargetGatewayActiveConnections(
  targetId: string,
): number {
  const entry = gatewayEntries.get(targetId);
  return entry?.activeConnections ?? 0;
}

export function listDatabaseTargetGateways(): string[] {
  return Array.from(gatewayEntries.keys());
}
