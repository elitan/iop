import { NextResponse } from "next/server";
import {
  hashPassword,
  isSetupComplete,
  setAdminPasswordHash,
} from "@/lib/auth";

export async function GET() {
  const setupComplete = await isSetupComplete();
  return NextResponse.json({ setupComplete });
}

export async function POST(request: Request) {
  if (await isSetupComplete()) {
    return NextResponse.json(
      { error: "setup already complete" },
      { status: 400 },
    );
  }

  const { password } = await request.json();

  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { error: "password is required" },
      { status: 400 },
    );
  }

  if (password.length < 4) {
    return NextResponse.json(
      { error: "password must be at least 4 characters" },
      { status: 400 },
    );
  }

  await setAdminPasswordHash(await hashPassword(password));

  return NextResponse.json({ success: true });
}
