"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function HeaderNav() {
  const [hasUpdate, setHasUpdate] = useState(false);

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
