import { NextResponse } from "next/server";
import { getCleanupSettings, startCleanupJob } from "@/lib/cleanup";

export async function GET() {
  const settings = await getCleanupSettings();
  return NextResponse.json({
    running: settings.running,
    lastRun: settings.lastRun,
    result: settings.lastResult,
  });
}

export async function POST() {
  const started = await startCleanupJob();
  if (!started) {
    return NextResponse.json(
      { error: "Cleanup already running" },
      { status: 409 },
    );
  }
  return NextResponse.json({ started: true });
}
