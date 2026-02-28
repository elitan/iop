import { FrostLogo } from "@/components/frost-logo";
import { cn } from "@/lib/utils";

interface BrandLockupProps {
  className?: string;
  textClassName?: string;
}

export function BrandLockup({ className, textClassName }: BrandLockupProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <FrostLogo size={22} className="shrink-0" />
      <span
        className={cn(
          "text-sm font-semibold tracking-tight text-neutral-100",
          textClassName,
        )}
      >
        Frost
      </span>
    </span>
  );
}
