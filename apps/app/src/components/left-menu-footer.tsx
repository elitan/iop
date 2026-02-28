"use client";

import { BookOpen, ChevronUp, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LeftMenuFooter() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Failed to log out");
    }
  }

  return (
    <div className="border-t border-neutral-800 p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            <span>Menu</span>
            <ChevronUp className="h-4 w-4 text-neutral-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/docs" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-neutral-400" />
              Docs
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-neutral-400" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-300 focus:bg-red-500/20 focus:text-red-200"
            onSelect={function onSelectLogout() {
              void handleLogout();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
