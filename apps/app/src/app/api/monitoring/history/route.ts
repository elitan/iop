import { NextResponse } from "next/server";
import { getMetricsHistory } from "@/lib/monitoring";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "1h";
  const type = searchParams.get("type") || "all";
  const serviceId = searchParams.get("serviceId") || undefined;
  const history = await getMetricsHistory(range, type, serviceId);
  return NextResponse.json(history);
}
