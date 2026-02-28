"use client";

import { X } from "lucide-react";
import type React from "react";
import { StateTabs } from "@/components/state-tabs";
import { Button } from "@/components/ui/button";

export interface ResourceSidebarTab<T extends string> {
  id: T;
  label: string;
}

interface ResourceSidebarProps<T extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  tabs: ResourceSidebarTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  children: React.ReactNode;
}

export function ResourceSidebar<T extends string>({
  isOpen,
  onClose,
  title,
  icon,
  tabs,
  activeTab,
  onTabChange,
  children,
}: ResourceSidebarProps<T>) {
  if (!isOpen) {
    return null;
  }

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-row items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
            {icon}
          </div>
          <h2 className="text-lg font-semibold text-neutral-200">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <StateTabs
          tabs={tabs}
          value={activeTab}
          onChange={onTabChange}
          layoutId="sidebar-tabs"
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );

  return content;
}
