"use client";

import { usePathname } from "next/navigation";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { Header } from "@/components/header";
import { useDemoMode } from "@/hooks/use-demo-mode";
import {
  SettingsMobileTabs,
  SettingsSidebar,
} from "./_components/settings-sidebar";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const demoMode = useDemoMode();
  const activeSection = pathname.split("/").pop() || "general";

  return (
    <>
      <Header>
        <BreadcrumbHeader pageName="Settings" />
      </Header>
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="md:hidden">
            <SettingsMobileTabs activeSection={activeSection} />
          </div>

          <aside className="hidden w-48 shrink-0 md:block">
            <div className="sticky top-20">
              <SettingsSidebar activeSection={activeSection} />
            </div>
          </aside>

          <div className="flex-1 space-y-6">
            {demoMode && <DemoModeAlert />}
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
