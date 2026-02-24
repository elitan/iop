"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDatabase,
  useDatabaseAttachments,
  useDatabaseTargets,
} from "@/hooks/use-databases";

export default function DatabaseOverviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const databaseId = params.databaseId as string;
  const envId = searchParams.get("env");

  const { data: database } = useDatabase(databaseId);
  const { data: targets = [] } = useDatabaseTargets(databaseId);
  const { data: attachments = [] } = useDatabaseAttachments(databaseId);

  if (!database) {
    return null;
  }

  const currentEnvAttachment = envId
    ? attachments.find((attachment) => attachment.environmentId === envId)
    : null;

  return (
    <div className="space-y-4">
      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-neutral-100">
            <span>{database.name}</span>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-neutral-700 text-neutral-300"
              >
                {database.engine}
              </Badge>
              <Badge
                variant="outline"
                className="border-neutral-700 text-neutral-300"
              >
                {database.provider}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-300">
          <div>Total targets: {targets.length}</div>
          <div>Attached environments: {attachments.length}</div>
          {currentEnvAttachment && (
            <div>
              Current env target:{" "}
              <span className="font-mono">
                {currentEnvAttachment.targetName}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-neutral-800 bg-neutral-900">
        <CardHeader>
          <CardTitle className="text-base text-neutral-100">
            Environment Attachments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <p className="text-sm text-neutral-500">No attachments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="pb-2 pr-4 font-medium">Environment</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Target</th>
                    <th className="pb-2 pr-4 font-medium">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((attachment) => (
                    <tr
                      key={attachment.id}
                      className="border-b border-neutral-900"
                    >
                      <td className="py-2 pr-4 text-neutral-200">
                        {attachment.environmentName}
                      </td>
                      <td className="py-2 pr-4 text-neutral-400">
                        {attachment.environmentType}
                      </td>
                      <td className="py-2 pr-4 font-mono text-neutral-300">
                        {attachment.targetName}
                      </td>
                      <td className="py-2 pr-4 text-neutral-400">
                        {attachment.mode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Link
          href={`/projects/${projectId}/databases/${databaseId}/branches${envId ? `?env=${envId}` : ""}`}
          className="text-sm text-neutral-300 underline-offset-4 hover:underline"
        >
          Manage targets
        </Link>
      </div>
    </div>
  );
}
