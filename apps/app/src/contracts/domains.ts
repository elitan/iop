import { oc } from "@orpc/contract";
import { z } from "zod";
import { domainsSchema } from "@/lib/db-schemas";

const dnsVerifyResultSchema = z.object({
  valid: z.boolean(),
  serverIp: z.string(),
  domainIp: z.string().nullable(),
  dnsVerified: z.boolean(),
  errorType: z.enum(["no_record", "wrong_ip"]).optional(),
});

const sslVerifyResultSchema = z.object({
  working: z.boolean(),
  status: z.enum(["active", "pending"]),
  error: z.string().optional(),
});

export const domainsContract = {
  get: oc
    .route({ method: "GET", path: "/domains/{id}" })
    .input(z.object({ id: z.string() }))
    .output(domainsSchema),

  listByService: oc
    .route({ method: "GET", path: "/services/{serviceId}/domains" })
    .input(z.object({ serviceId: z.string() }))
    .output(z.array(domainsSchema)),

  listByEnvironment: oc
    .route({ method: "GET", path: "/environments/{environmentId}/domains" })
    .input(z.object({ environmentId: z.string() }))
    .output(z.array(domainsSchema)),

  listByServiceIds: oc
    .input(z.object({ serviceIds: z.array(z.string()) }))
    .output(z.array(domainsSchema)),

  create: oc
    .route({ method: "POST", path: "/services/{serviceId}/domains" })
    .input(
      z.object({
        serviceId: z.string(),
        domain: z.string().min(1),
        type: z.enum(["proxy", "redirect"]).default("proxy"),
        redirectTarget: z.string().optional(),
        redirectCode: z.union([z.literal(301), z.literal(307)]).optional(),
      }),
    )
    .output(domainsSchema),

  update: oc
    .route({ method: "PATCH", path: "/domains/{id}" })
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["proxy", "redirect"]).optional(),
        redirectTarget: z.string().optional(),
        redirectCode: z.union([z.literal(301), z.literal(307)]).optional(),
      }),
    )
    .output(domainsSchema),

  delete: oc
    .route({ method: "DELETE", path: "/domains/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() })),

  verifyDns: oc
    .route({ method: "POST", path: "/domains/{id}/verify-dns" })
    .input(z.object({ id: z.string() }))
    .output(dnsVerifyResultSchema),

  verifySsl: oc
    .route({ method: "POST", path: "/domains/{id}/verify-ssl" })
    .input(z.object({ id: z.string() }))
    .output(sslVerifyResultSchema),
};
