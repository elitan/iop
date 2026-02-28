import type { ReactNode } from "react";
import { ShellTopRow } from "./shell-top-row";

interface MainContentHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function MainContentHeader({
  title,
  actions,
  className,
}: MainContentHeaderProps) {
  return (
    <ShellTopRow className={className}>
      <div className="flex w-full items-center justify-between gap-3">
        <div className="min-w-0 truncate text-base font-semibold text-neutral-200">
          {title}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </ShellTopRow>
  );
}
