"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { type SyntheticEvent, useEffect, useState } from "react";
import { useDatabase } from "@/hooks/use-databases";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoUrl,
} from "@/lib/database-logo";
import {
  ResourceSidebar,
  type ResourceSidebarTab,
} from "../../../../_components/resource-sidebar";

type DatabaseLayoutTab = "branches" | "settings";

function getActiveTab(pathname: string): DatabaseLayoutTab {
  if (pathname.includes("/settings")) {
    return "settings";
  }
  return "branches";
}

export default function DatabaseDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const databaseId = params.databaseId as string;
  const basePath = `/projects/${projectId}/environments/${envId}/databases/${databaseId}`;
  const activeTab = getActiveTab(pathname);
  const isBranchDetailPage =
    /^\/projects\/[^/]+\/environments\/[^/]+\/databases\/[^/]+\/branches\/[^/]+(?:\/[^/]+)?$/.test(
      pathname,
    );
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

  function handleLogoError(event: SyntheticEvent<HTMLImageElement>) {
    if (logoSrc === DATABASE_LOGO_FALLBACK) {
      return;
    }
    event.currentTarget.src = DATABASE_LOGO_FALLBACK;
    setLogoSrc(DATABASE_LOGO_FALLBACK);
  }

  const tabs: ResourceSidebarTab<DatabaseLayoutTab>[] = [
    {
      id: "branches",
      label: database?.engine === "postgres" ? "Branches" : "Instances",
    },
    {
      id: "settings",
      label: "Settings",
    },
  ];

  function handleTabChange(tab: DatabaseLayoutTab) {
    switch (tab) {
      case "branches":
        router.push(`${basePath}/branches`);
        return;
      case "settings":
        router.push(`${basePath}/settings`);
        return;
    }
  }

  function handleClose() {
    router.push(`/projects/${projectId}/environments/${envId}`);
  }

  if (isBranchDetailPage) {
    return <div className="h-full min-h-0 overflow-hidden">{children}</div>;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ResourceSidebar
        isOpen
        onClose={handleClose}
        title={database?.name ?? "Database"}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        contentMode={activeTab === "settings" ? "center" : "full"}
        icon={
          <img
            src={logoSrc}
            alt=""
            className="h-4 w-4 object-contain"
            onError={handleLogoError}
          />
        }
      >
        {children}
      </ResourceSidebar>
    </div>
  );
}
