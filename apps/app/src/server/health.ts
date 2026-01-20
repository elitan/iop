import * as nodeOs from "node:os";
import packageJson from "../../package.json";
import { os } from "./orpc";

export const health = {
  check: os.health.check.handler(() => ({
    ok: true,
    version: packageJson.version,
  })),

  hostResources: os.health.hostResources.handler(() => ({
    cpus: nodeOs.cpus().length,
    totalMemoryGB: Math.floor(nodeOs.totalmem() / 1024 / 1024 / 1024),
  })),
};
