"use client";

import { useParams, usePathname } from "next/navigation";
import {
  SettingsMobileTabs,
  SettingsSidebar,
} from "./_components/settings-sidebar";

export default function ServiceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const projectId = params.id as string;
  const serviceId = params.serviceId as string;

  const pathname = usePathname();
  const parts = pathname.split("/");
  const activeSection = parts[parts.length - 1] || "general";

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <div className="md:hidden">
        <SettingsMobileTabs
          projectId={projectId}
          serviceId={serviceId}
          activeSection={activeSection}
        />
      </div>

      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-20">
          <SettingsSidebar
            projectId={projectId}
            serviceId={serviceId}
            activeSection={activeSection}
          />
        </div>
      </aside>

      <div className="flex-1">{children}</div>
    </div>
  );
}
