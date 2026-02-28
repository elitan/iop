import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ShellTopRowProps {
  children: ReactNode;
  className?: string;
}

export function ShellTopRow({ children, className }: ShellTopRowProps) {
  return (
    <div className={cn("h-14 border-b border-neutral-800 px-4", className)}>
      <div className="flex h-full items-center">{children}</div>
    </div>
  );
}
