"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface NavItem {
  id: string;
  label: string;
  href: string;
}

const NAV_ITEMS: { id: string; label: string; path: string }[] = [
  { id: "general", label: "General", path: "" },
  { id: "variables", label: "Env vars", path: "/variables" },
  { id: "environments", label: "Environments", path: "/environments" },
];

function useNavItems(projectId: string): NavItem[] {
  const searchParams = useSearchParams();
  const envParam = searchParams.get("env") ?? "";
  const base = `/projects/${projectId}/settings`;
  const suffix = envParam ? `?env=${envParam}` : "";

  return NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    href: `${base}${item.path}${suffix}`,
  }));
}

function isActiveItem(activeSection: string, itemId: string): boolean {
  return (
    activeSection === itemId ||
    (activeSection === "settings" && itemId === "general")
  );
}

interface SettingsSidebarProps {
  projectId: string;
  activeSection: string;
}

export function SettingsSidebar({
  projectId,
  activeSection,
}: SettingsSidebarProps) {
  const navItems = useNavItems(projectId);

  return (
    <nav className="space-y-0.5">
      {navItems.map((item) => {
        const isActive = isActiveItem(activeSection, item.id);
        return (
          <Link
            key={item.id}
            href={item.href}
            className="relative block rounded-md px-3 py-2 text-sm transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="project-settings-indicator"
                className="absolute inset-0 rounded-md bg-neutral-800/80"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span
              className={`relative z-10 ${isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsMobileTabs({
  projectId,
  activeSection,
}: SettingsSidebarProps) {
  const navItems = useNavItems(projectId);

  return (
    <nav className="flex gap-1 overflow-x-auto pb-4">
      {navItems.map((item) => {
        const isActive = isActiveItem(activeSection, item.id);
        return (
          <Link
            key={item.id}
            href={item.href}
            className="relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="project-settings-mobile-indicator"
                className="absolute inset-0 rounded-md bg-neutral-800/80"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span
              className={`relative z-10 ${isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
