import Link from "next/link";
import type { ReactNode } from "react";
import { FrostLogo } from "./frost-logo";
import { HeaderNav } from "./header-nav";

interface BreadcrumbHeaderProps {
  projectName?: string;
  projectHref?: string;
  projectPicker?: ReactNode;
  serviceName?: string;
  environmentPicker?: ReactNode;
  pageName?: string;
  actions?: ReactNode;
}

export function BreadcrumbHeader({
  projectName,
  projectHref,
  projectPicker,
  serviceName,
  environmentPicker,
  pageName,
  actions,
}: BreadcrumbHeaderProps) {
  const hasContext =
    !!pageName ||
    !!projectName ||
    !!projectPicker ||
    !!serviceName ||
    !!environmentPicker;

  const projectNode = projectPicker ? (
    projectPicker
  ) : projectHref ? (
    <Link
      href={projectHref}
      className="text-sm text-neutral-100 transition-colors hover:text-neutral-300"
    >
      {projectName}
    </Link>
  ) : (
    <span className="text-sm text-neutral-100">{projectName}</span>
  );

  return (
    <div className="border-b border-neutral-800">
      <div className="container mx-auto flex h-14 items-center px-4">
        <nav className="flex items-center gap-3">
          <Link
            href="/"
            className="text-neutral-100 transition-colors hover:text-neutral-300"
          >
            <FrostLogo />
          </Link>
          {hasContext && <span className="h-4 w-px bg-neutral-700" />}
          {pageName && (
            <span className="text-sm text-neutral-200">{pageName}</span>
          )}
          {(projectName || projectPicker) && (
            <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-2 py-1">
              {projectNode}
            </div>
          )}
          {serviceName && (
            <span className="truncate text-sm text-neutral-200">
              {serviceName}
            </span>
          )}
          {environmentPicker && (
            <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-2 py-1">
              {environmentPicker}
            </div>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          {actions}
          <HeaderNav />
        </div>
      </div>
    </div>
  );
}
