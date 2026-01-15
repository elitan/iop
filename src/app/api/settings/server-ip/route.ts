import { NextResponse } from "next/server";
import { getServerIp } from "@/lib/domains";

export async function GET() {
  try {
    const ip = await getServerIp();
    return NextResponse.json({ ip });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get server IP",
      },
      { status: 500 },
    );
  }
}
