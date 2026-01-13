"use client";

import Link from "next/link";

interface NavItem {
  id: string;
  label: string;
  href: string;
}

function getNavItems(projectId: string, serviceId: string): NavItem[] {
  const base = `/projects/${projectId}/services/${serviceId}/settings`;
  return [
    { id: "general", label: "General", href: base },
    { id: "variables", label: "Variables", href: `${base}/variables` },
    { id: "domains", label: "Domains", href: `${base}/domains` },
    { id: "volumes", label: "Volumes", href: `${base}/volumes` },
    { id: "runtime", label: "Runtime", href: `${base}/runtime` },
  ];
}

interface SettingsSidebarProps {
  projectId: string;
  serviceId: string;
  activeSection: string;
}

export function SettingsSidebar({
  projectId,
  serviceId,
  activeSection,
}: SettingsSidebarProps) {
  const navItems = getNavItems(projectId, serviceId);

  return (
    <nav className="space-y-0.5">
      {navItems.map((item) => {
        const isActive =
          activeSection === item.id ||
          (activeSection === "settings" && item.id === "general");
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? "bg-neutral-800/80 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsMobileTabs({
  projectId,
  serviceId,
  activeSection,
}: SettingsSidebarProps) {
  const navItems = getNavItems(projectId, serviceId);

  return (
    <nav className="flex gap-1 overflow-x-auto pb-4">
      {navItems.map((item) => {
        const isActive =
          activeSection === item.id ||
          (activeSection === "settings" && item.id === "general");
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-neutral-800/80 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
