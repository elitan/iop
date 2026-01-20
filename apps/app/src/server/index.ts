import { apiKeys } from "./api-keys";
import { cleanup } from "./cleanup";
import { deployments } from "./deployments";
import { domains } from "./domains";
import { github } from "./github";
import { health } from "./health";
import { os } from "./orpc";
import { projects } from "./projects";
import { registries } from "./registries";
import { services } from "./services";
import { settings } from "./settings";
import { dbTemplates, templates } from "./templates";
import { updates } from "./updates";

export const router = os.router({
  apiKeys,
  cleanup,
  dbTemplates,
  deployments,
  domains,
  github,
  health,
  projects,
  registries,
  services,
  settings,
  templates,
  updates,
});

export type Router = typeof router;
