import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import { apiKeys } from "./api-keys";
import { deployments } from "./deployments";
import { domains } from "./domains";
import { health } from "./health";
import { projects } from "./projects";
import { registries } from "./registries";
import { services } from "./services";
import { dbTemplates, templates } from "./templates";

export const router = {
  apiKeys,
  dbTemplates,
  deployments,
  domains,
  health,
  projects,
  registries,
  services,
  templates,
};

export type Router = typeof router;
export type RouterInputs = InferRouterInputs<Router>;
export type RouterOutputs = InferRouterOutputs<Router>;
