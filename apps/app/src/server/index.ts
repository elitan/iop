import { apiKeys } from "./api-keys";
import { cleanup } from "./cleanup";
import { databases } from "./databases";
import { deployments } from "./deployments";
import { domains } from "./domains";
import { environments } from "./environments";
import { github } from "./github";
import { health } from "./health";
import { mcpTokens } from "./mcp-tokens";
import { os } from "./orpc";
import { projects } from "./projects";
import { registries } from "./registries";
import { services } from "./services";
import { settings } from "./settings";
import { templates } from "./templates";
import { updates } from "./updates";

export const router = os.router({
  apiKeys,
  cleanup,
  databases,
  deployments,
  domains,
  environments,
  github,
  health,
  mcpTokens,
  projects,
  registries,
  services,
  settings,
  templates,
  updates,
});

export type Router = typeof router;
