import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClassName: Record<StatusTone, string> = {
  neutral: "border-neutral-700 bg-neutral-900/80 text-neutral-400",
  info: "border-blue-800 bg-blue-900/30 text-blue-400",
  success: "border-green-800 bg-green-900/30 text-green-400",
  warning: "border-yellow-800 bg-yellow-900/30 text-yellow-400",
  danger: "border-red-800 bg-red-900/30 text-red-400",
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatusTone;
}

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs", toneClassName[tone], className)}
      {...props}
    />
  );
}
