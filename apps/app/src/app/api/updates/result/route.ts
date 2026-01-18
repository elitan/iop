import { NextResponse } from "next/server";
import {
  clearPersistedUpdateResult,
  getPersistedUpdateResult,
} from "@/lib/updater";

export async function GET() {
  const result = await getPersistedUpdateResult();

  if (!result) {
    return NextResponse.json({
      completed: false,
      success: false,
      newVersion: null,
      log: null,
    });
  }

  return NextResponse.json(result);
}

export async function DELETE() {
  await clearPersistedUpdateResult();
  return NextResponse.json({ success: true });
}
