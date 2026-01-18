import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const DEFAULT_SECRET = "frost-default-secret-change-me";

export async function GET() {
  const secret = process.env.FROST_JWT_SECRET;
  if (!secret || secret === DEFAULT_SECRET) {
    return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  }

  const apiKey = createHash("sha256")
    .update(`${secret}frost-api-key`)
    .digest("hex")
    .slice(0, 32);

  return NextResponse.json({ apiKey });
}
