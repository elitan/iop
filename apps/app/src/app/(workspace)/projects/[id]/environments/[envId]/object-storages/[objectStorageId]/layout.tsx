"use client";

import { Server } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useObjectStorage } from "@/hooks/use-object-storages";
import {
  ResourceSidebar,
  type ResourceSidebarTab,
} from "../../../../_components/resource-sidebar";

type ObjectStorageLayoutTab = "overview" | "settings";

function getActiveTab(pathname: string): ObjectStorageLayoutTab {
  if (pathname.includes("/settings")) {
    return "settings";
  }
  return "overview";
}

export default function ObjectStorageDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params.id as string;
  const envId = params.envId as string;
  const objectStorageId = params.objectStorageId as string;
  const basePath = `/projects/${projectId}/environments/${envId}/object-storages/${objectStorageId}`;
  const activeTab = getActiveTab(pathname);
  const { data } = useObjectStorage(objectStorageId);

  const tabs: ResourceSidebarTab<ObjectStorageLayoutTab>[] = [
    { id: "overview", label: "Overview" },
    { id: "settings", label: "Settings" },
  ];

  function handleTabChange(tab: ObjectStorageLayoutTab) {
    switch (tab) {
      case "overview":
        router.push(basePath);
        return;
      case "settings":
        router.push(`${basePath}/settings`);
        return;
    }
  }

  function handleClose() {
    router.push(`/projects/${projectId}/environments/${envId}`);
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ResourceSidebar
        isOpen
        onClose={handleClose}
        title={data?.objectStorage.name ?? "Object Storage"}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        contentMode="center"
        icon={<Server className="h-4 w-4" />}
      >
        {children}
      </ResourceSidebar>
    </div>
  );
}
