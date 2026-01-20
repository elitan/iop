import type {
  InferContractRouterInputs,
  InferContractRouterOutputs,
} from "@orpc/contract";
import { apiKeysContract } from "./api-keys";
import { deploymentsContract } from "./deployments";
import { domainsContract } from "./domains";
import { healthContract } from "./health";
import { projectsContract } from "./projects";
import { registriesContract } from "./registries";
import { servicesContract } from "./services";
import { dbTemplatesContract, templatesContract } from "./templates";

export const contract = {
  apiKeys: apiKeysContract,
  dbTemplates: dbTemplatesContract,
  deployments: deploymentsContract,
  domains: domainsContract,
  health: healthContract,
  projects: projectsContract,
  registries: registriesContract,
  services: servicesContract,
  templates: templatesContract,
};

export type Contract = typeof contract;
export type ContractInputs = InferContractRouterInputs<Contract>;
export type ContractOutputs = InferContractRouterOutputs<Contract>;
