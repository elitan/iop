"use client";

import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useMemo } from "react";
import { StatusDot } from "@/components/status-dot";
import type { ProjectListItem } from "@/lib/api";
import { getKnownServiceLogo } from "@/lib/service-logo";
import { cn } from "@/lib/utils";
import { ProjectAvatar } from "./project-avatar";

type CanvasPositions = Record<string, { x: number; y: number }>;

interface MiniServiceNodeProps {
  service: ProjectListItem["services"][number];
}

const POSITION_SCALE = 3;

function MiniServiceNode({ service }: MiniServiceNodeProps) {
  const logo = getKnownServiceLogo(service);

  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700"
      title={service.name}
    >
      {logo ? (
        <img src={logo} alt="" className="h-6 w-6 object-contain" />
      ) : (
        <span className="text-base font-semibold text-neutral-300">
          {service.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

interface ProjectArchitectureCardProps {
  project: ProjectListItem;
}

export function ProjectArchitectureCard({
  project,
}: ProjectArchitectureCardProps) {
  const runningCount = project.services.filter(
    (s) => s.status === "running",
  ).length;
  const totalCount = project.services.length;

  const nodes = useMemo(() => {
    const positions: CanvasPositions = project.canvasPositions
      ? (JSON.parse(project.canvasPositions) as CanvasPositions)
      : {};

    return project.services.map((service, index) => {
      const realPos = positions[service.id] || { x: 60 + index * 140, y: 60 };
      const scaledPos = {
        x: realPos.x / POSITION_SCALE,
        y: realPos.y / POSITION_SCALE,
      };
      return {
        id: service.id,
        position: scaledPos,
        data: { service },
        type: "miniService",
      };
    });
  }, [project.services, project.canvasPositions]);

  const nodeTypes = useMemo(
    () => ({
      miniService: ({
        data,
      }: {
        data: { service: MiniServiceNodeProps["service"] };
      }) => <MiniServiceNode service={data.service} />,
    }),
    [],
  );

  const hasDeployment =
    runningCount > 0 || project.services.some((s) => s.status);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden transition-colors hover:border-neutral-700 hover:bg-neutral-800/50"
    >
      <div
        className={cn(
          "relative h-52 w-full",
          totalCount === 0 && "flex items-center justify-center",
        )}
      >
        {totalCount === 0 ? (
          <span className="text-sm text-neutral-500">No services</span>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            elementsSelectable={false}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#404040"
            />
          </ReactFlow>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-neutral-800 p-3">
        <ProjectAvatar name={project.name} size="sm" />
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-neutral-100 truncate">
            {project.name}
          </h2>
        </div>
        {hasDeployment && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <StatusDot status={runningCount > 0 ? "running" : "pending"} />
            <span>
              {runningCount}/{totalCount} online
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
