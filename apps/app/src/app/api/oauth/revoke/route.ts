import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoModeBlockedMessage, isDemoMode } from "@/lib/demo-mode";
import { hashOAuthToken, parseOAuthBody } from "@/lib/oauth";

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: getDemoModeBlockedMessage("oauth token revoke"),
      },
      { status: 400 },
    );
  }

  const body = await parseOAuthBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const tokenHash = hashOAuthToken(token);

  await db
    .deleteFrom("oauthTokens")
    .where((eb) =>
      eb.or([
        eb("accessTokenHash", "=", tokenHash),
        eb("refreshTokenHash", "=", tokenHash),
      ]),
    )
    .execute();

  return new NextResponse(null, { status: 200 });
}
