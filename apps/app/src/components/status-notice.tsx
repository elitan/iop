import type * as React from "react";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClassName: Record<StatusTone, string> = {
  neutral: "bg-neutral-800/60 text-neutral-300",
  info: "bg-blue-900/20 text-blue-400",
  success: "bg-green-900/20 text-green-400",
  warning: "bg-yellow-900/20 text-yellow-400",
  danger: "bg-red-900/20 text-red-400",
};

interface StatusNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatusTone;
  heading?: React.ReactNode;
  icon?: React.ReactNode;
}

export function StatusNotice({
  tone = "neutral",
  heading,
  icon,
  className,
  children,
  ...props
}: StatusNoticeProps) {
  return (
    <div
      className={cn("rounded-md p-3", toneClassName[tone], className)}
      {...props}
    >
      <div className="flex items-start gap-2">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <div className="min-w-0">
          {heading ? <p className="font-medium">{heading}</p> : null}
          {children ? (
            <div className={cn(heading ? "mt-1 text-sm" : "text-sm")}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
