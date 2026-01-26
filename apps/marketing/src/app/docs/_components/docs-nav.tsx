"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLink {
  title: string;
  href: string;
}

interface NavSection {
  title: string;
  items: NavLink[];
}

const navigation: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Installation", href: "/docs/installation" },
    ],
  },
  {
    title: "Concepts",
    items: [
      { title: "Projects", href: "/docs/concepts/projects" },
      { title: "Services", href: "/docs/concepts/services" },
      { title: "Deployments", href: "/docs/concepts/deployments" },
      { title: "Domains", href: "/docs/concepts/domains" },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "Environment Variables", href: "/docs/guides/env-vars" },
      { title: "Custom Domains", href: "/docs/guides/custom-domains" },
      { title: "Config File", href: "/docs/guides/config-file" },
    ],
  },
  {
    title: "Help",
    items: [{ title: "Troubleshooting", href: "/docs/troubleshooting" }],
  },
  ...(process.env.NODE_ENV === "development"
    ? [
        {
          title: "Dev",
          items: [{ title: "Test Page", href: "/docs/test" }],
        },
      ]
    : []),
];

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-6">
      {navigation.map((section) => (
        <div key={section.title}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            {section.title}
          </h3>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const isActive = item.href === pathname;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative block rounded-md px-2 py-1.5 text-sm"
                >
                  {isActive && (
                    <motion.div
                      layoutId="docs-nav-indicator"
                      className="absolute inset-0 rounded-md bg-white/5 border border-white/10"
                      transition={{
                        type: "spring",
                        bounce: 0.15,
                        duration: 0.5,
                      }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.title}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
