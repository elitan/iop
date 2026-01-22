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
          {pageName && (
            <>
              <span className="text-neutral-600">/</span>
              <span className="text-sm text-neutral-100">{pageName}</span>
            </>
          )}
          {(projectName || projectPicker) && (
            <>
              <span className="text-neutral-600">/</span>
              {projectPicker ? (
                projectPicker
              ) : projectHref ? (
                <Link
                  href={projectHref}
                  className="text-sm text-neutral-100 hover:text-neutral-300"
                >
                  {projectName}
                </Link>
              ) : (
                <span className="text-sm text-neutral-100">{projectName}</span>
              )}
            </>
          )}
          {serviceName && (
            <>
              <span className="text-neutral-600">/</span>
              <span className="text-sm text-neutral-100">{serviceName}</span>
            </>
          )}
          {environmentPicker && (
            <>
              <span className="text-neutral-600">/</span>
              {environmentPicker}
            </>
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
