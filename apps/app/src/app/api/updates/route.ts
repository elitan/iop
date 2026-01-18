import { NextResponse } from "next/server";
import { checkForUpdate, getUpdateStatus } from "@/lib/updater";

export async function GET() {
  const status = await getUpdateStatus();
  return NextResponse.json(status);
}

export async function POST() {
  const result = await checkForUpdate(true);
  return NextResponse.json(result);
}
