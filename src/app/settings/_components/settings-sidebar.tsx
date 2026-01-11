"use client";

import Link from "next/link";

interface NavItem {
  id: string;
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "general", label: "General", href: "/settings" },
  { id: "monitoring", label: "Monitoring", href: "/settings/monitoring" },
  { id: "domain", label: "Domain & SSL", href: "/settings/domain" },
  { id: "api-keys", label: "API Keys", href: "/settings/api-keys" },
  { id: "github", label: "GitHub", href: "/settings/github" },
  { id: "cleanup", label: "Cleanup", href: "/settings/cleanup" },
];

interface SettingsSidebarProps {
  activeSection: string;
}

export function SettingsSidebar({ activeSection }: SettingsSidebarProps) {
  return (
    <nav className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
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

export function SettingsMobileTabs({ activeSection }: SettingsSidebarProps) {
  return (
    <nav className="flex gap-1 overflow-x-auto pb-4">
      {NAV_ITEMS.map((item) => {
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
