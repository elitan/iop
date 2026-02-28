import { streamDatabaseTargetLogs } from "@/lib/database-target-logs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ databaseId: string; targetId: string }> },
) {
  const { databaseId, targetId } = await params;
  const url = new URL(request.url);
  const tail = parseInt(url.searchParams.get("tail") || "100", 10);

  return streamDatabaseTargetLogs({
    databaseId,
    targetId,
    tail,
    request,
    requireBranchAlias: true,
  });
}
