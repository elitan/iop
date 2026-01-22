"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { orpc } from "@/lib/orpc-client";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { data: environments = [] } = useQuery(
    orpc.environments.list.queryOptions({ input: { projectId } }),
  );

  useEffect(() => {
    if (environments.length > 0) {
      const production = environments.find((e) => e.type === "production");
      const targetEnv = production ?? environments[0];
      router.replace(`/projects/${projectId}/environments/${targetEnv.id}`);
    }
  }, [environments, projectId, router]);

  return null;
}
