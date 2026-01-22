"use client";

import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, Plus, Server } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpc } from "@/lib/orpc-client";
import { CreateEnvironmentDialog } from "./_components/create-environment-dialog";

export default function EnvironmentsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [createOpen, setCreateOpen] = useState(false);

  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );

  const production = environments.find((e) => e.type === "production");
  const previews = environments.filter((e) => e.type === "preview");
  const manual = environments.filter((e) => e.type === "manual");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Environments</h2>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create Environment
        </Button>
      </div>

      {environments.length === 0 ? (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="py-12">
            <EmptyState
              title="No environments"
              description="Create a production environment to get started"
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create Environment
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {production && (
            <section>
              <h3 className="text-sm font-medium text-neutral-400 mb-3">
                Production
              </h3>
              <EnvironmentCard
                env={production}
                projectId={projectId}
                icon={<Server className="h-4 w-4" />}
              />
            </section>
          )}

          {previews.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-neutral-400 mb-3">
                Preview Environments
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {previews.map((env) => (
                  <EnvironmentCard
                    key={env.id}
                    env={env}
                    projectId={projectId}
                    icon={<GitPullRequest className="h-4 w-4" />}
                  />
                ))}
              </div>
            </section>
          )}

          {manual.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-neutral-400 mb-3">
                Manual Environments
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {manual.map((env) => (
                  <EnvironmentCard
                    key={env.id}
                    env={env}
                    projectId={projectId}
                    icon={<Server className="h-4 w-4" />}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <CreateEnvironmentDialog
        projectId={projectId}
        environments={environments}
        currentEnvId={production?.id ?? environments[0]?.id ?? ""}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

interface EnvironmentCardProps {
  env: {
    id: string;
    name: string;
    type: string;
    prNumber: number | null;
    prBranch: string | null;
    createdAt: number;
  };
  projectId: string;
  icon: React.ReactNode;
}

function EnvironmentCard({ env, projectId, icon }: EnvironmentCardProps) {
  return (
    <Link href={`/projects/${projectId}/environments/${env.id}`}>
      <Card className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-base">{env.name}</CardTitle>
            </div>
            <Badge
              variant={env.type === "production" ? "default" : "secondary"}
            >
              {env.type}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {env.prBranch && (
            <p className="text-sm text-neutral-400">Branch: {env.prBranch}</p>
          )}
          <p className="text-xs text-neutral-500 mt-1">
            Created {new Date(env.createdAt).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
