"use client";

import {
  ChevronRight,
  Globe,
  HardDrive,
  Key,
  Server,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Service } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SidebarSettingsProps {
  service: Service;
  projectId: string;
}

interface SettingsLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  variant?: "default" | "danger";
}

function SettingsLink({
  href,
  icon,
  label,
  description,
  variant = "default",
}: SettingsLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg p-3 transition-colors",
        variant === "danger"
          ? "hover:bg-red-950/50 text-red-400"
          : "hover:bg-neutral-700",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          variant === "danger" ? "bg-red-950/50" : "bg-neutral-700",
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            variant === "danger" ? "text-red-400" : "text-neutral-200",
          )}
        >
          {label}
        </p>
        <p className="text-xs text-neutral-500">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-neutral-500" />
    </Link>
  );
}

export function SidebarSettings({ service, projectId }: SidebarSettingsProps) {
  const basePath = `/projects/${projectId}/services/${service.id}/settings`;

  return (
    <div className="space-y-4 ">
      <Card className="bg-neutral-800 border-neutral-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-neutral-300">
            General
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          <SettingsLink
            href={basePath}
            icon={<Settings className="h-4 w-4 text-neutral-400" />}
            label="General"
            description="Service name and build config"
          />
          <SettingsLink
            href={`${basePath}/variables`}
            icon={<Key className="h-4 w-4 text-neutral-400" />}
            label="Environment Variables"
            description="Configure env vars"
          />
          <SettingsLink
            href={`${basePath}/domains`}
            icon={<Globe className="h-4 w-4 text-neutral-400" />}
            label="Domains"
            description="Custom domains and SSL"
          />
        </CardContent>
      </Card>

      <Card className="bg-neutral-800 border-neutral-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-neutral-300">
            Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          <SettingsLink
            href={`${basePath}/runtime`}
            icon={<Server className="h-4 w-4 text-neutral-400" />}
            label="Runtime"
            description="Memory, CPU, and health checks"
          />
          {service.serviceType !== "database" && (
            <SettingsLink
              href={`${basePath}/volumes`}
              icon={<HardDrive className="h-4 w-4 text-neutral-400" />}
              label="Volumes"
              description="Persistent storage"
            />
          )}
        </CardContent>
      </Card>

      <Card className="bg-neutral-800 border-neutral-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-neutral-300">
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          <SettingsLink
            href={basePath}
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete Service"
            description="Permanently delete this service"
            variant="danger"
          />
        </CardContent>
      </Card>
    </div>
  );
}
