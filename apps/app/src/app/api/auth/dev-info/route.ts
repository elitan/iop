import { NextResponse } from "next/server";
import { getDevPassword } from "@/lib/auth";

export async function GET() {
  const devPassword = getDevPassword();
  return NextResponse.json({ devPassword });
}
