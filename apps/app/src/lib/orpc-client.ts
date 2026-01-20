import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import { type Contract, contract } from "@/contracts";

const link = new OpenAPILink(contract, {
  url: () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api`;
    }
    return "http://localhost:3000/api";
  },
});

export const client: JsonifiedClient<ContractRouterClient<Contract>> =
  createORPCClient(link);

export const orpc = createORPCReactQueryUtils(client);
