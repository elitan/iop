import https from "node:https";
import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/auth";
import { lockToDomain } from "@/lib/caddy";

async function checkHttps(
  domain: string,
  rejectUnauthorized: boolean,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: domain,
        port: 443,
        method: "GET",
        timeout: 5000,
        rejectUnauthorized,
      },
      (res) => {
        resolve({ ok: true, status: res.statusCode });
      },
    );
    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { domain } = body;

  if (!domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const staging = (await getSetting("ssl_staging")) === "true";

  try {
    const result = await checkHttps(domain, !staging);

    if (result.ok && result.status && result.status < 500) {
      await setSetting("ssl_enabled", "true");

      const email = await getSetting("email");
      if (email) {
        await lockToDomain(domain, email, staging);
      }

      return NextResponse.json({ working: true });
    }

    return NextResponse.json({
      working: false,
      error: result.error || `Server returned ${result.status}`,
    });
  } catch (error) {
    return NextResponse.json({
      working: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
}
