import { NextResponse } from "next/server";
import { getSetting } from "@/lib/auth";
import { getServerIp } from "@/lib/domains";

export async function GET() {
  const isDev = process.env.NODE_ENV === "development";

  const [domain, email, sslEnabled, serverIp] = await Promise.all([
    getSetting("domain"),
    getSetting("email"),
    getSetting("ssl_enabled"),
    isDev
      ? Promise.resolve("localhost")
      : getServerIp().catch(() => "localhost"),
  ]);

  return NextResponse.json({
    domain,
    email,
    sslEnabled,
    serverIp,
  });
}
