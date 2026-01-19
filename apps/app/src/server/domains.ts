import https from "node:https";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { getSetting } from "@/lib/auth";
import { db } from "@/lib/db";
import { domainsSchema } from "@/lib/db-schemas";
import {
  addDomain,
  getDomain,
  getDomainByName,
  getDomainsForService,
  removeDomain,
  syncCaddyConfig,
  updateDomain,
  verifyDomainDns,
} from "@/lib/domains";
import { os } from "@/lib/orpc";

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

function checkHttps(
  domain: string,
  rejectUnauthorized: boolean,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: domain,
        port: 443,
        method: "HEAD",
        timeout: 10000,
        rejectUnauthorized,
      },
      (res) => {
        resolve({ ok: (res.statusCode ?? 500) < 500, status: res.statusCode });
      },
    );

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Connection timeout" });
    });

    req.end();
  });
}

export const domains = {
  get: os
    .route({ method: "GET", path: "/domains/{id}" })
    .input(z.object({ id: z.string() }))
    .output(domainsSchema)
    .handler(async ({ input }) => {
      const domain = await getDomain(input.id);
      if (!domain) {
        throw new ORPCError("NOT_FOUND", { message: "Domain not found" });
      }
      return domain;
    }),

  listByService: os
    .route({ method: "GET", path: "/services/{serviceId}/domains" })
    .input(z.object({ serviceId: z.string() }))
    .output(z.array(domainsSchema))
    .handler(async ({ input }) => {
      const service = await db
        .selectFrom("services")
        .select("id")
        .where("id", "=", input.serviceId)
        .executeTakeFirst();

      if (!service) {
        throw new ORPCError("NOT_FOUND", { message: "Service not found" });
      }

      return await getDomainsForService(input.serviceId);
    }),

  listByServiceIds: os
    .input(z.object({ serviceIds: z.array(z.string()) }))
    .output(z.array(domainsSchema))
    .handler(async ({ input }) => {
      if (input.serviceIds.length === 0) {
        return [];
      }
      return await db
        .selectFrom("domains")
        .selectAll()
        .where("serviceId", "in", input.serviceIds)
        .execute();
    }),

  create: os
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
    .output(domainsSchema)
    .handler(async ({ input }) => {
      const service = await db
        .selectFrom("services")
        .select("id")
        .where("id", "=", input.serviceId)
        .executeTakeFirst();

      if (!service) {
        throw new ORPCError("NOT_FOUND", { message: "Service not found" });
      }

      const existing = await getDomainByName(input.domain);
      if (existing) {
        throw new ORPCError("CONFLICT", { message: "Domain already exists" });
      }

      if (input.type === "redirect" && !input.redirectTarget) {
        throw new ORPCError("BAD_REQUEST", {
          message: "redirectTarget is required for redirect type",
        });
      }

      const newDomain = await addDomain(input.serviceId, {
        domain: input.domain,
        type: input.type,
        redirectTarget: input.redirectTarget,
        redirectCode: input.redirectCode,
      });

      return newDomain;
    }),

  update: os
    .route({ method: "PATCH", path: "/domains/{id}" })
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["proxy", "redirect"]).optional(),
        redirectTarget: z.string().optional(),
        redirectCode: z.union([z.literal(301), z.literal(307)]).optional(),
      }),
    )
    .output(domainsSchema)
    .handler(async ({ input }) => {
      const domain = await getDomain(input.id);
      if (!domain) {
        throw new ORPCError("NOT_FOUND", { message: "Domain not found" });
      }

      const updates: Parameters<typeof updateDomain>[1] = {};
      if (input.type !== undefined) updates.type = input.type;
      if (input.redirectTarget !== undefined)
        updates.redirectTarget = input.redirectTarget;
      if (input.redirectCode !== undefined)
        updates.redirectCode = input.redirectCode;

      const updated = await updateDomain(input.id, updates);

      if (domain.dnsVerified) {
        try {
          await syncCaddyConfig();
        } catch {}
      }

      return updated;
    }),

  delete: os
    .route({ method: "DELETE", path: "/domains/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      const domain = await getDomain(input.id);
      if (!domain) {
        throw new ORPCError("NOT_FOUND", { message: "Domain not found" });
      }

      if (domain.isSystem) {
        const otherVerifiedDomains = await db
          .selectFrom("domains")
          .select("id")
          .where("serviceId", "=", domain.serviceId)
          .where("id", "!=", input.id)
          .where("dnsVerified", "=", true)
          .execute();

        if (otherVerifiedDomains.length === 0) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Cannot delete system domain when no other verified domain exists",
          });
        }
      }

      await removeDomain(input.id);

      if (domain.dnsVerified) {
        try {
          await syncCaddyConfig();
        } catch {}
      }

      return { success: true };
    }),

  verifyDns: os
    .route({ method: "POST", path: "/domains/{id}/verify-dns" })
    .input(z.object({ id: z.string() }))
    .output(dnsVerifyResultSchema)
    .handler(async ({ input }) => {
      const domain = await getDomain(input.id);
      if (!domain) {
        throw new ORPCError("NOT_FOUND", { message: "Domain not found" });
      }

      const dnsStatus = await verifyDomainDns(domain.domain);

      if (dnsStatus.valid && !domain.dnsVerified) {
        await updateDomain(input.id, { dnsVerified: true });
        try {
          await syncCaddyConfig();
        } catch (err) {
          console.error("Failed to sync Caddy config:", err);
        }
      }

      return { ...dnsStatus, dnsVerified: dnsStatus.valid };
    }),

  verifySsl: os
    .route({ method: "POST", path: "/domains/{id}/verify-ssl" })
    .input(z.object({ id: z.string() }))
    .output(sslVerifyResultSchema)
    .handler(async ({ input }) => {
      const domain = await getDomain(input.id);
      if (!domain) {
        throw new ORPCError("NOT_FOUND", { message: "Domain not found" });
      }

      if (!domain.dnsVerified) {
        throw new ORPCError("BAD_REQUEST", { message: "DNS not verified" });
      }

      if (domain.sslStatus === "active") {
        return { working: true, status: "active" as const };
      }

      const staging = (await getSetting("ssl_staging")) === "true";
      const result = await checkHttps(domain.domain, !staging);

      if (result.ok) {
        await updateDomain(input.id, { sslStatus: "active" });
        return { working: true, status: "active" as const };
      }

      return {
        working: false,
        status: "pending" as const,
        error: result.error,
      };
    }),
};
