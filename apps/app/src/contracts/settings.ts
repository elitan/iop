import { oc } from "@orpc/contract";
import { z } from "zod";

export const settingsContract = {
  get: oc.route({ method: "GET", path: "/settings" }).output(
    z.object({
      domain: z.string().nullable(),
      email: z.string().nullable(),
      sslEnabled: z.string().nullable(),
      serverIp: z.string(),
      demoMode: z.boolean(),
    }),
  ),

  verifyDns: oc
    .route({ method: "POST", path: "/settings/verify-dns" })
    .input(z.object({ domain: z.string() }))
    .output(
      z.object({
        valid: z.boolean(),
        serverIp: z.string(),
        domainIp: z.string().nullable(),
        allDomainIps: z.array(z.string()),
      }),
    ),

  verifySsl: oc
    .route({ method: "POST", path: "/settings/verify-ssl" })
    .input(z.object({ domain: z.string() }))
    .output(
      z.object({
        working: z.boolean(),
        error: z.string().optional(),
      }),
    ),

  enableSsl: oc
    .route({ method: "POST", path: "/settings/enable-ssl" })
    .input(
      z.object({
        domain: z.string(),
        email: z.string(),
        staging: z.boolean().optional(),
      }),
    )
    .output(z.object({ success: z.boolean(), status: z.string() })),

  github: {
    get: oc.route({ method: "GET", path: "/settings/github" }).output(
      z.object({
        hasDomain: z.boolean(),
        domain: z.string().nullable(),
        connected: z.boolean(),
        installed: z.boolean(),
        appName: z.string().nullable(),
        appSlug: z.string().nullable(),
        installations: z.array(
          z.object({
            id: z.number(),
            accountLogin: z.string(),
            accountType: z.string(),
          }),
        ),
      }),
    ),

    manifest: oc
      .route({ method: "GET", path: "/settings/github/manifest" })
      .output(
        z.object({
          manifest: z.record(z.string(), z.unknown()),
          domain: z.string(),
        }),
      ),

    disconnect: oc
      .route({ method: "POST", path: "/settings/github/disconnect" })
      .output(z.object({ success: z.boolean() })),

    testCredentials: oc
      .route({ method: "PUT", path: "/settings/github/test-credentials" })
      .input(
        z.object({
          appId: z.string(),
          slug: z.string(),
          name: z.string(),
          privateKey: z.string(),
          webhookSecret: z.string(),
          clientId: z.string(),
          clientSecret: z.string(),
        }),
      )
      .output(z.object({ success: z.boolean() })),
  },

  changePassword: oc
    .route({ method: "PUT", path: "/settings/password" })
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(4),
      }),
    )
    .output(z.object({ success: z.boolean() })),

  wildcard: {
    get: oc.route({ method: "GET", path: "/settings/wildcard" }).output(
      z.object({
        wildcardDomain: z.string().nullable(),
        dnsProvider: z.string().nullable(),
        configured: z.boolean(),
        hasToken: z.boolean(),
      }),
    ),

    set: oc
      .route({ method: "POST", path: "/settings/wildcard" })
      .input(
        z.object({
          wildcardDomain: z.string(),
          dnsProvider: z.string(),
          dnsApiToken: z.string(),
        }),
      )
      .output(
        z.object({
          success: z.boolean(),
          dnsWarning: z.string().optional(),
          caddyWarning: z.string().optional(),
          backfilledCount: z.number(),
        }),
      ),

    delete: oc.route({ method: "DELETE", path: "/settings/wildcard" }).output(
      z.object({
        success: z.boolean(),
        caddyWarning: z.string().optional(),
      }),
    ),

    test: oc
      .route({ method: "POST", path: "/settings/wildcard/test" })
      .input(
        z.object({
          dnsProvider: z.string(),
          dnsApiToken: z.string(),
        }),
      )
      .output(
        z.object({
          valid: z.boolean(),
          error: z.string().optional(),
        }),
      ),
  },
};
