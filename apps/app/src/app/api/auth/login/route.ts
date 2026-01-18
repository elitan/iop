import { NextResponse } from "next/server";
import {
  createSessionToken,
  getAdminPasswordHash,
  isDevMode,
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

  let valid = false;

  if (isDevMode()) {
    valid = await verifyDevPassword(password);
  } else {
    const hash = await getAdminPasswordHash();
    if (!hash) {
      return NextResponse.json(
        { error: "setup not complete" },
        { status: 503 },
      );
    }
    valid = await verifyPassword(password, hash);
  }

  if (!valid) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  const token = createSessionToken();
  const response = NextResponse.json({ success: true });

  response.cookies.set("frost_session", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
