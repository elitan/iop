"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  label: string;
  href: string;
}

interface TabNavProps {
  tabs: Tab[];
  layoutId: string;
  actions?: React.ReactNode;
}

export function getPathFromHref(href: string): string {
  const queryIndex = href.indexOf("?");
  return queryIndex === -1 ? href : href.slice(0, queryIndex);
}

export function isTabActive(
  pathname: string,
  tabPath: string,
  firstTabPath: string,
): boolean {
  if (pathname === tabPath) return true;
  if (tabPath === firstTabPath) return false;
  return pathname.startsWith(tabPath);
}

export function TabNav({ tabs, layoutId, actions }: TabNavProps) {
  const pathname = usePathname();
  const firstTabPath = getPathFromHref(tabs[0].href);

  return (
    <nav className="border-b border-neutral-800">
      <div className="container mx-auto flex gap-6 px-4">
        <div className="flex flex-1 gap-6">
          {tabs.map((tab) => {
            const tabPath = getPathFromHref(tab.href);
            const isActive = isTabActive(pathname, tabPath, firstTabPath);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative py-3 text-sm transition-colors",
                  isActive
                    ? "text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300",
                )}
              >
                {tab.label}
                {isActive && (
                  <motion.span
                    layoutId={layoutId}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-100"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
        {actions && <div className="ml-auto flex items-center">{actions}</div>}
      </div>
    </nav>
  );
}
