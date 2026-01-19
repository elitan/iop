import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import type { RouterClient } from "@orpc/server";
import type { Router } from "@/server/index";

const link = new RPCLink({
  url: "/api/rpc",
});

export const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createORPCReactQueryUtils(client);
