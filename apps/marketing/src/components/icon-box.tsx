import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconBoxProps {
  icon: LucideIcon;
  size?: "sm" | "md";
  className?: string;
}

export function IconBox({ icon: Icon, size = "sm", className }: IconBoxProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-b from-white/[0.12] to-white/[0.02] border border-white/[0.1] flex items-center justify-center",
        size === "sm" && "w-9 h-9",
        size === "md" && "w-10 h-10",
        className,
      )}
    >
      <Icon className="text-white/80" size={size === "sm" ? 18 : 20} />
    </div>
  );
}
