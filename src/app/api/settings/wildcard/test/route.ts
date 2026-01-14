import { NextResponse } from "next/server";

interface CloudflareVerifyResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: {
    id: string;
    status: string;
  };
}

async function verifyCloudflareToken(apiToken: string): Promise<boolean> {
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) {
    return false;
  }

  const data = (await res.json()) as CloudflareVerifyResponse;
  return data.success && data.result?.status === "active";
}

export async function POST(request: Request) {
  const body = await request.json();
  const { dnsProvider, dnsApiToken } = body;

  if (!dnsProvider) {
    return NextResponse.json(
      { error: "dnsProvider is required" },
      { status: 400 },
    );
  }

  if (!dnsApiToken) {
    return NextResponse.json(
      { error: "dnsApiToken is required" },
      { status: 400 },
    );
  }

  if (dnsProvider !== "cloudflare") {
    return NextResponse.json(
      { error: "Only cloudflare is supported" },
      { status: 400 },
    );
  }

  try {
    const valid = await verifyCloudflareToken(dnsApiToken);

    if (!valid) {
      return NextResponse.json(
        { valid: false, error: "Invalid or inactive API token" },
        { status: 200 },
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    return NextResponse.json(
      {
        valid: false,
        error:
          error instanceof Error ? error.message : "Failed to verify token",
      },
      { status: 200 },
    );
  }
}
