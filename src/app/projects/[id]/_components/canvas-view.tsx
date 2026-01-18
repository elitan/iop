"use client";

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type CanvasPositions,
  useCanvasPositions,
} from "@/hooks/use-canvas-positions";
import type { Service } from "@/lib/api";
import { CanvasControls } from "./canvas-controls";
import {
  ServiceNode,
  type ServiceNodeData,
  type ServiceNodeType,
} from "./service-node";

const nodeTypes = {
  service: ServiceNode,
} as const;

interface CanvasViewProps {
  projectId: string;
  services: Service[];
  initialPositions: CanvasPositions;
  domains: Record<string, string>;
  serverIp: string | null;
  selectedServiceId: string | null;
  onSelectService: (serviceId: string | null) => void;
}

function CanvasViewInner({
  projectId,
  services,
  initialPositions,
  domains,
  serverIp,
  selectedServiceId,
  onSelectService,
}: CanvasViewProps) {
  const { updatePosition, getPosition } = useCanvasPositions(
    projectId,
    initialPositions,
  );
  const { fitView, zoomIn, zoomOut, setViewport, getZoom } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<ServiceNodeType[]>([]);

  useEffect(() => {
    setNodes(
      services.map((service, index) => {
        const pos = getPosition(service.id, index);
        const data: ServiceNodeData = {
          service,
          domain: domains[service.id] || null,
          serverIp,
          isSelected: selectedServiceId === service.id,
        };
        return {
          id: service.id,
          type: "service" as const,
          position: pos,
          data,
        };
      }),
    );
  }, [services, domains, serverIp, selectedServiceId, getPosition]);

  useEffect(() => {
    if (!selectedServiceId || nodes.length === 0) return;

    const selectedNode = nodes.find((n) => n.id === selectedServiceId);
    if (!selectedNode) return;

    const container = containerRef.current;
    if (!container) return;

    const currentZoom = getZoom();
    const zoom = Math.max(currentZoom, 1.25);
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;

    const nodeWidth = 256;
    const nodeHeight = 100;
    const nodeCenterX = selectedNode.position.x + nodeWidth / 2;
    const nodeCenterY = selectedNode.position.y + nodeHeight / 2;

    const targetScreenX = containerWidth * 0.2;
    const targetScreenY = containerHeight / 2;

    const viewportX = targetScreenX - nodeCenterX * zoom;
    const viewportY = targetScreenY - nodeCenterY * zoom;

    setViewport({ x: viewportX, y: viewportY, zoom }, { duration: 300 });
  }, [selectedServiceId, nodes, setViewport, getZoom]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ServiceNodeType>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: { id: string; position: { x: number; y: number } }) => {
      updatePosition(node.id, node.position.x, node.position.y);
    },
    [updatePosition],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: { id: string }) => {
      onSelectService(node.id);
    },
    [onSelectService],
  );

  const onPaneClick = useCallback(() => {
    onSelectService(null);
  }, [onSelectService]);

  if (services.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="py-12">
            <EmptyState
              title="No services yet"
              description="Add a service to get started with deployments"
              action={
                <Button asChild size="sm">
                  <Link href={`/projects/${projectId}/services/new`}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Service
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full bg-neutral-950">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ maxZoom: 1.25 }}
        minZoom={0.25}
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
      <CanvasControls
        onZoomIn={() => zoomIn()}
        onZoomOut={() => zoomOut()}
        onFitView={() => fitView({ maxZoom: 1.25 })}
      />
    </div>
  );
}

export function CanvasView(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}
