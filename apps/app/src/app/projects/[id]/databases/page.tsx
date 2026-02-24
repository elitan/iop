"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDatabases,
  useEnvironmentDatabaseAttachments,
} from "@/hooks/use-databases";
import { orpc } from "@/lib/orpc-client";

export default function ProjectDatabasesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const envId = searchParams.get("env") ?? "";

  const { data: databases = [] } = useDatabases(projectId);
  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );
  const { data: attachments = [] } = useEnvironmentDatabaseAttachments(envId);

  const envName = environments.find(
    (environment) => environment.id === envId,
  )?.name;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-100">Databases</h1>
        <p className="text-sm text-neutral-400">
          Attach environments to branch or instance targets.
        </p>
      </div>

      {databases.length === 0 ? (
        <Card className="border-neutral-800 bg-neutral-900">
          <CardContent className="py-12 text-center text-sm text-neutral-400">
            No databases yet. Create your first database from the header action.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {databases.map((database) => {
            const attachment = attachments.find(
              (item) => item.databaseId === database.id,
            );

            const suffix = envId ? `?env=${envId}` : "";

            return (
              <Link
                key={database.id}
                href={`/projects/${projectId}/databases/${database.id}${suffix}`}
                className="group"
              >
                <Card className="h-full border-neutral-800 bg-neutral-900 transition-colors group-hover:border-neutral-600">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-neutral-100">
                      <Database className="h-4 w-4 text-neutral-400" />
                      {database.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
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

                    {envId && (
                      <div className="rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-300">
                        {attachment
                          ? `${envName ?? "Env"} -> ${attachment.targetName}`
                          : `${envName ?? "Env"} not attached`}
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-neutral-500 group-hover:text-neutral-300">
                      Open details
                      <ExternalLink className="h-3.5 w-3.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
