"use client";

import { useEffect, useState } from "react";
import { ServiceRuntimeIndicator } from "@/components/service-runtime-indicator";
import { Badge } from "@/components/ui/badge";
import type { Service } from "@/lib/api";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoAlt,
  getDatabaseLogoUrl,
} from "@/lib/database-logo";

export interface CanvasDatabase {
  id: string;
  name: string;
  engine: "postgres" | "mysql";
  provider: "postgres-docker" | "mysql-docker";
  runtimeStatus?: Service["runtimeStatus"];
  attentionStatus?: Service["attentionStatus"];
}

interface DatabaseContentProps {
  database: CanvasDatabase;
}

function getDatabaseSubtitle(engine: "postgres" | "mysql"): string {
  if (engine === "postgres") {
    return "branches managed manually";
  }
  return "instances managed manually";
}

export function DatabaseContent({ database }: DatabaseContentProps) {
  const [logoSrc, setLogoSrc] = useState(getDatabaseLogoUrl(database.engine));

  useEffect(
    function syncLogo() {
      setLogoSrc(getDatabaseLogoUrl(database.engine));
    },
    [database.engine],
  );

  function handleLogoError() {
    if (logoSrc === DATABASE_LOGO_FALLBACK) {
      return;
    }
    setLogoSrc(DATABASE_LOGO_FALLBACK);
  }

  return (
    <>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
          <img
            src={logoSrc}
            alt={getDatabaseLogoAlt(database.engine)}
            className="h-5 w-5 object-contain"
            onError={handleLogoError}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-neutral-200">
              {database.name}
            </p>
            {database.runtimeStatus && (
              <ServiceRuntimeIndicator
                runtimeStatus={database.runtimeStatus}
                attentionStatus={database.attentionStatus ?? null}
                className="shrink-0"
              />
            )}
          </div>
          <p className="truncate text-xs text-neutral-500">
            {getDatabaseSubtitle(database.engine)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Badge
          variant="outline"
          className="border-neutral-700 text-neutral-300"
        >
          {database.engine}
        </Badge>
      </div>
    </>
  );
}
