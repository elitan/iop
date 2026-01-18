import { NextResponse } from "next/server";
import { clearGitHubAppCredentials } from "@/lib/github";

export async function POST() {
  try {
    await clearGitHubAppCredentials();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
