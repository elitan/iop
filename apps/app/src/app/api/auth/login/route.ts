import { NextResponse } from "next/server";
import {
  createSessionToken,
  getAdminPasswordHash,
  isDevMode,
  isSetupComplete,
  verifyDevPassword,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json(
      { error: "password is required" },
      { status: 400 },
    );
  }

  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    return NextResponse.json({ error: "setup not complete" }, { status: 503 });
  }

  const hash = await getAdminPasswordHash();
  const validHash = hash && (await verifyPassword(password, hash));
  const validDev = isDevMode() && (await verifyDevPassword(password));

  if (!validHash && !validDev) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  const token = createSessionToken();
  const response = NextResponse.json({ success: true });

  response.cookies.set("frost_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
