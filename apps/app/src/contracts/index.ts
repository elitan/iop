import type {
  InferContractRouterInputs,
  InferContractRouterOutputs,
} from "@orpc/contract";
import { apiKeysContract } from "./api-keys";
import { cleanupContract } from "./cleanup";
import { deploymentsContract } from "./deployments";
import { domainsContract } from "./domains";
import { githubContract } from "./github";
import { healthContract } from "./health";
import { projectsContract } from "./projects";
import { registriesContract } from "./registries";
import { servicesContract } from "./services";
import { settingsContract } from "./settings";
import { dbTemplatesContract, templatesContract } from "./templates";
import { updatesContract } from "./updates";

export const contract = {
  apiKeys: apiKeysContract,
  cleanup: cleanupContract,
  dbTemplates: dbTemplatesContract,
  deployments: deploymentsContract,
  domains: domainsContract,
  github: githubContract,
  health: healthContract,
  projects: projectsContract,
  registries: registriesContract,
  services: servicesContract,
  settings: settingsContract,
  templates: templatesContract,
  updates: updatesContract,
};

export type Contract = typeof contract;
export type ContractInputs = InferContractRouterInputs<Contract>;
export type ContractOutputs = InferContractRouterOutputs<Contract>;
