"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TabNav } from "@/components/tab-nav";
import { useDatabase } from "@/hooks/use-databases";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoAlt,
  getDatabaseLogoUrl,
} from "@/lib/database-logo";

export default function DatabaseDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;
  const { data: database } = useDatabase(databaseId);
  const [logoSrc, setLogoSrc] = useState(DATABASE_LOGO_FALLBACK);

  useEffect(
    function syncLogo() {
      if (!database) {
        setLogoSrc(DATABASE_LOGO_FALLBACK);
        return;
      }
      setLogoSrc(getDatabaseLogoUrl(database.engine));
    },
    [database],
  );

  function handleLogoError() {
    if (logoSrc === DATABASE_LOGO_FALLBACK) {
      return;
    }
    setLogoSrc(DATABASE_LOGO_FALLBACK);
  }

  const tabs = [
    {
      label: database?.engine === "postgres" ? "Branches" : "Instances",
      href: `/projects/${projectId}/environments/${envId}/databases/${databaseId}/branches`,
    },
    {
      label: "Settings",
      href: `/projects/${projectId}/environments/${envId}/databases/${databaseId}/settings`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900">
          <img
            src={logoSrc}
            alt={getDatabaseLogoAlt(database?.engine ?? "postgres")}
            className="h-5 w-5 object-contain"
            onError={handleLogoError}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-100">
            {database?.name ?? "Database"}
          </p>
          <p className="text-xs text-neutral-500">
            {database?.engine === "mysql" ? "MySQL" : "PostgreSQL"}
          </p>
        </div>
      </div>
      <TabNav tabs={tabs} layoutId="database-tabs" />
      <div>{children}</div>
    </div>
  );
}
