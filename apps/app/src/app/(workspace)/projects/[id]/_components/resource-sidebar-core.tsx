"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { type ResourceContentMode, ResourceSidebar } from "./resource-sidebar";

export type CoreSidebarTab = "overview" | "deployments" | "logs" | "settings";

export interface CoreSidebarSections {
  overview: React.ReactNode;
  deployments: React.ReactNode;
  logs: React.ReactNode;
  settings: React.ReactNode;
}

export interface CoreSidebarExtraTab<T extends string = string> {
  id: T;
  label: string;
  content: React.ReactNode;
}

interface ResourceSidebarCoreProps<T extends string = never> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  coreSections: CoreSidebarSections;
  extraTabs?: CoreSidebarExtraTab<T>[];
  resetKey?: string | null;
  tabOrder?: Array<CoreSidebarTab | T>;
  initialTab?: CoreSidebarTab | T;
  onActiveTabChange?: (tab: CoreSidebarTab | T) => void;
  getContentMode?: (tab: CoreSidebarTab | T) => ResourceContentMode;
}

const CORE_TABS: { id: CoreSidebarTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Logs" },
  { id: "settings", label: "Settings" },
];

function isCoreSidebarTab(value: string): value is CoreSidebarTab {
  return (
    value === "overview" ||
    value === "deployments" ||
    value === "logs" ||
    value === "settings"
  );
}

export function ResourceSidebarCore<T extends string = never>({
  isOpen,
  onClose,
  title,
  icon,
  coreSections,
  extraTabs = [],
  resetKey,
  tabOrder,
  initialTab,
  onActiveTabChange,
  getContentMode,
}: ResourceSidebarCoreProps<T>) {
  const [activeTab, setActiveTab] = useState<CoreSidebarTab | T>("overview");

  const tabs = useMemo(
    function getTabs() {
      const allTabs: Array<{ id: CoreSidebarTab | T; label: string }> = [
        ...CORE_TABS,
        ...extraTabs.map(function toSidebarTab(tab) {
          return { id: tab.id, label: tab.label };
        }),
      ];
      if (!tabOrder || tabOrder.length === 0) {
        return allTabs;
      }
      const orderedTabs: Array<{ id: CoreSidebarTab | T; label: string }> = [];
      for (const id of tabOrder) {
        const tab = allTabs.find(function hasTab(candidate) {
          return candidate.id === id;
        });
        if (tab) {
          orderedTabs.push(tab);
        }
      }
      return orderedTabs;
    },
    [extraTabs, tabOrder],
  );

  const firstTabId = tabs[0]?.id;
  const fallbackTab = firstTabId ?? "overview";

  useEffect(
    function resetTabOnResourceChange() {
      if (resetKey === undefined) {
        return;
      }
      setActiveTab(initialTab ?? fallbackTab);
    },
    [fallbackTab, initialTab, resetKey],
  );

  useEffect(
    function keepTabValid() {
      const currentTabId = String(activeTab);
      const exists = tabs.some(function hasTab(tab) {
        return tab.id === currentTabId;
      });
      if (!exists) {
        setActiveTab(fallbackTab);
      }
    },
    [activeTab, fallbackTab, tabs],
  );

  useEffect(
    function syncInitialTab() {
      if (!initialTab) {
        return;
      }
      const exists = tabs.some(function hasTab(tab) {
        return tab.id === initialTab;
      });
      if (!exists) {
        return;
      }
      setActiveTab(initialTab);
    },
    [initialTab, tabs],
  );

  useEffect(
    function emitActiveTabChange() {
      onActiveTabChange?.(activeTab);
    },
    [activeTab, onActiveTabChange],
  );

  const currentTabId = String(activeTab);

  let content: React.ReactNode = null;
  if (isCoreSidebarTab(currentTabId)) {
    content = coreSections[currentTabId];
  } else {
    const extraTab = extraTabs.find(function findTab(tab) {
      return tab.id === currentTabId;
    });
    content = extraTab?.content ?? null;
  }

  return (
    <ResourceSidebar<CoreSidebarTab | T>
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      contentMode={getContentMode?.(activeTab) ?? "full"}
    >
      {content}
    </ResourceSidebar>
  );
}
