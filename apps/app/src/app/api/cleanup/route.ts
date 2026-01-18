import { NextResponse } from "next/server";
import { getCleanupSettings, updateCleanupSettings } from "@/lib/cleanup";

export async function GET() {
  const settings = await getCleanupSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const body = await request.json();
  await updateCleanupSettings(body);
  const settings = await getCleanupSettings();
  return NextResponse.json(settings);
}
