"use client";

import { motion } from "framer-motion";
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
  { id: "registries", label: "Registries", href: "/settings/registries" },
  { id: "mcp-tokens", label: "MCP Tokens", href: "/settings/mcp-tokens" },
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
            className="relative block rounded-md px-3 py-2 text-sm transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="global-settings-indicator"
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
            className="relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="global-settings-mobile-indicator"
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
