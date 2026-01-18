import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?:
    | {
        label: string;
        href: string;
      }
    | ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="mb-4 rounded-full bg-neutral-800 p-3">
          <Icon className="h-6 w-6 text-neutral-400" />
        </div>
      )}
      <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {typeof action === "object" && "href" in action ? (
            <Button asChild size="sm">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
