import Link from "next/link";
import type { ReactNode } from "react";
import { FrostLogo } from "./frost-logo";
import { HeaderNav } from "./header-nav";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbHeaderProps {
  items: BreadcrumbItem[];
  actions?: ReactNode;
}

export function BreadcrumbHeader({ items, actions }: BreadcrumbHeaderProps) {
  return (
    <div className="border-b border-neutral-800">
      <div className="container mx-auto flex h-14 items-center gap-2 px-4">
        <Link
          href="/"
          className="text-neutral-100 transition-colors hover:text-neutral-300"
        >
          <FrostLogo />
        </Link>
        {items.map((item) => (
          <div
            key={item.href ?? item.label}
            className="flex items-center gap-2.5"
          >
            <span className="text-neutral-600">/</span>
            {item.href ? (
              <Link
                href={item.href}
                className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-sm text-neutral-100">{item.label}</span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4">
          {actions}
          <HeaderNav />
        </div>
      </div>
    </div>
  );
}
