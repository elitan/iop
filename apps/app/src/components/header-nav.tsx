"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemoMode } from "@/hooks/use-demo-mode";

export function HeaderNav() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const demoMode = useDemoMode();

  useEffect(() => {
    fetch("/api/updates")
      .then((res) => res.json())
      .then((data) => {
        setHasUpdate(!!data.availableVersion);
      })
      .catch(() => {});
  }, []);

  return (
    <nav className="flex items-center gap-4">
      {demoMode && (
        <>
          <span className="text-sm text-amber-300">
            Demo mode. Resets hourly.
          </span>
          <span className="h-4 w-px bg-neutral-700" />
        </>
      )}
      <Link
        href="/docs"
        className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
      >
        Docs
      </Link>
      <Link
        href="/settings"
        className="relative text-sm text-neutral-400 transition-colors hover:text-neutral-100"
      >
        Settings
        {hasUpdate && (
          <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-blue-500" />
        )}
      </Link>
    </nav>
  );
}
