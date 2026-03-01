"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DatabaseOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;

  useEffect(
    function redirectToBranches() {
      router.replace(
        `/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches`,
      );
    },
    [databaseId, envId, projectId, router],
  );

  return null;
}
