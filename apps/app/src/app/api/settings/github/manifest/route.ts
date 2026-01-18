import { NextResponse } from "next/server";
import { getSetting } from "@/lib/auth";
import { buildManifest } from "@/lib/github";

export async function GET() {
  const domain = await getSetting("domain");
  const sslEnabled = await getSetting("ssl_enabled");

  if (!domain || sslEnabled !== "true") {
    return NextResponse.json(
      { error: "Domain with SSL must be configured first" },
      { status: 400 },
    );
  }

  const manifest = buildManifest(domain);
  return NextResponse.json({ manifest, domain });
}
