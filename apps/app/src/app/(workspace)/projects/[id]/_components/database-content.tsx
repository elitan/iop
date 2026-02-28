"use client";

import { useEffect, useState } from "react";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
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
}

export interface CanvasDatabaseAttachment {
  databaseId: string;
  targetName: string;
  targetLifecycleStatus: "active" | "stopped" | "expired";
  mode: "managed" | "manual";
}

interface DatabaseContentProps {
  database: CanvasDatabase;
  attachment: CanvasDatabaseAttachment | null;
}

export function DatabaseContent({
  database,
  attachment,
}: DatabaseContentProps) {
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
            <StatusDot
              status={attachment?.targetLifecycleStatus ?? "stopped"}
            />
          </div>
          <p className="truncate text-xs text-neutral-500">
            {attachment
              ? attachment.targetName
              : database.engine === "postgres"
                ? "main"
                : "not attached"}
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
        {attachment && (
          <span className="text-xs text-neutral-500">{attachment.mode}</span>
        )}
      </div>
    </>
  );
}
