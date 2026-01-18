import { NextResponse } from "next/server";
import { applyUpdate } from "@/lib/updater";

export async function POST() {
  const result = await applyUpdate();

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
