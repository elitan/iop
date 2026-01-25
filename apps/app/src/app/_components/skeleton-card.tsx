import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonArchitectureCard() {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="h-52 bg-neutral-950" />
      <div className="flex items-center gap-3 border-t border-neutral-800 p-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
    </div>
  );
}
