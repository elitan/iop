"use client";

import { useParams, useSearchParams } from "next/navigation";
import { TabNav } from "@/components/tab-nav";
import { useDatabase } from "@/hooks/use-databases";

export default function DatabaseDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const databaseId = params.databaseId as string;
  const { data: database } = useDatabase(databaseId);
  const envId = searchParams.get("env");
  const suffix = envId ? `?env=${envId}` : "";

  const tabs = [
    {
      label: "Overview",
      href: `/projects/${projectId}/databases/${databaseId}${suffix}`,
    },
    {
      label: database?.engine === "postgres" ? "Branches" : "Instances",
      href: `/projects/${projectId}/databases/${databaseId}/branches${suffix}`,
    },
    {
      label: "Settings",
      href: `/projects/${projectId}/databases/${databaseId}/settings${suffix}`,
    },
  ];

  return (
    <div className="space-y-6">
      <TabNav tabs={tabs} layoutId="database-tabs" />
      <div>{children}</div>
    </div>
  );
}
