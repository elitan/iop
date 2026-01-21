"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  Github,
  Package,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { client, orpc } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/time";
import { DeleteEnvironmentDialog } from "./_components/delete-environment-dialog";

export default function EnvironmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const envId = params.envId as string;

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: environment } = useQuery(
    orpc.environments.get.queryOptions({ input: { id: envId } }),
  );

  const deployMutation = useMutation({
    mutationFn: () => client.environments.deploy({ id: envId }),
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orpc.environments.get.queryOptions({ input: { id: envId } })
          .queryKey,
      });
    },
  });

  if (!environment) return null;

  const services = environment.services || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{environment.name}</h2>
          <Badge
            variant={environment.type === "production" ? "default" : "secondary"}
          >
            {environment.type}
          </Badge>
          {environment.prBranch && (
            <span className="flex items-center gap-1 text-sm text-neutral-400">
              <GitBranch className="h-4 w-4" />
              {environment.prBranch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending || services.length === 0}
          >
            <Play className="mr-1.5 h-4 w-4" />
            {deployMutation.isPending ? "Deploying..." : "Deploy All"}
          </Button>
          {environment.type !== "production" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {services.length === 0 ? (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="py-12">
            <EmptyState
              title="No services"
              description="Add a service to this environment"
              action={
                <Button asChild size="sm">
                  <Link
                    href={`/projects/${projectId}/environments/${envId}/services/new`}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Service
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      <DeleteEnvironmentDialog
        environmentId={envId}
        environmentName={environment.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push(`/projects/${projectId}/environments`)}
      />
    </div>
  );
}

interface ServiceCardProps {
  service: {
    id: string;
    name: string;
    deployType: string;
    repoUrl: string | null;
    imageUrl: string | null;
    branch: string | null;
    latestDeployment: {
      status: string;
      commitMessage: string | null;
      createdAt: number;
    } | null;
  };
  projectId: string;
}

function ServiceCard({ service, projectId }: ServiceCardProps) {
  const deployment = service.latestDeployment;
  const githubRepo = service.repoUrl?.match(/github\.com\/([^/]+\/[^/]+)/)?.[1];

  return (
    <Link href={`/projects/${projectId}/services/${service.id}`}>
      <Card className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{service.name}</CardTitle>
            <StatusDot status={deployment?.status || "pending"} />
          </div>
        </CardHeader>
        <CardContent>
          {service.deployType === "repo" && githubRepo && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 mb-2">
              <Github className="h-3 w-3" />
              {githubRepo}
            </span>
          )}

          {service.deployType === "image" && service.imageUrl && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 mb-2">
              <Package className="h-3 w-3" />
              {service.imageUrl}
            </span>
          )}

          {deployment?.commitMessage && (
            <p className="text-sm text-neutral-400 line-clamp-1 mb-2">
              {deployment.commitMessage}
            </p>
          )}

          {deployment && (
            <div className="flex items-center gap-1 text-xs text-neutral-500 mt-2">
              <span>{getTimeAgo(new Date(deployment.createdAt))}</span>
              {service.deployType === "repo" && service.branch && (
                <>
                  <span>on</span>
                  <GitBranch className="h-3 w-3" />
                  <span>{service.branch}</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
