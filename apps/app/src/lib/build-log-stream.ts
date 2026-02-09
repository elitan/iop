import { EventEmitter } from "node:events";

const buildLogEmitter = new EventEmitter();
buildLogEmitter.setMaxListeners(0);

function getEventName(deploymentId: string): string {
  return `build-log:${deploymentId}`;
}

export function emitBuildLogChunk(deploymentId: string, chunk: string): void {
  if (!chunk) return;
  buildLogEmitter.emit(getEventName(deploymentId), chunk);
}

export function subscribeBuildLogChunks(
  deploymentId: string,
  listener: (chunk: string) => void,
): () => void {
  const eventName = getEventName(deploymentId);
  buildLogEmitter.on(eventName, listener);
  return function unsubscribe(): void {
    buildLogEmitter.off(eventName, listener);
  };
}
