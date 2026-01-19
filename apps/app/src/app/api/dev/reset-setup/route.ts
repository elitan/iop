import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "only available in development mode" },
      { status: 403 },
    );
  }

  await db
    .deleteFrom("settings")
    .where("key", "=", "admin_password_hash")
    .execute();

  return NextResponse.json({ success: true });
}
