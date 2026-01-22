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
import { Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type CanvasPositions,
  useCanvasPositions,
} from "@/hooks/use-canvas-positions";
import { useDeleteService } from "@/hooks/use-services";
import type { Service } from "@/lib/api";
import { CanvasControls } from "./canvas-controls";
import {
  ServiceNode,
  type ServiceNodeData,
  type ServiceNodeType,
} from "./service-node";

interface ContextMenuState {
  x: number;
  y: number;
  serviceId: string;
}

const GRID_SIZE = 20;
const NODE_WIDTH = 256;
const NODE_HEIGHT = 100;
const nodeTypes = { service: ServiceNode } as const;

const ARROW_KEY_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function calculateViewportForNode(
  nodePos: { x: number; y: number },
  containerWidth: number,
  containerHeight: number,
  currentZoom: number,
): { x: number; y: number; zoom: number } {
  const zoom = Math.max(currentZoom, 1.25);
  const nodeCenterX = nodePos.x + NODE_WIDTH / 2;
  const nodeCenterY = nodePos.y + NODE_HEIGHT / 2;
  const targetScreenX = containerWidth * 0.2;
  const targetScreenY = containerHeight / 2;
  return {
    x: targetScreenX - nodeCenterX * zoom,
    y: targetScreenY - nodeCenterY * zoom,
    zoom,
  };
}

interface CanvasViewProps {
  projectId: string;
  environmentId: string;
  services: Service[];
  initialPositions: CanvasPositions;
  domains: Record<string, string>;
  serverIp: string | null;
  selectedServiceId: string | null;
  onSelectService: (serviceId: string | null) => void;
  onOpenCreateModal: () => void;
}

function CanvasViewInner({
  projectId,
  environmentId,
  services,
  initialPositions,
  domains,
  serverIp,
  selectedServiceId,
  onSelectService,
  onOpenCreateModal,
}: CanvasViewProps) {
  const { updatePosition, getPosition } = useCanvasPositions(
    projectId,
    initialPositions,
  );
  const { fitView, zoomIn, zoomOut, setViewport, getZoom } = useReactFlow();
  const deleteMutation = useDeleteService(environmentId);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMovedRef = useRef(false);
  const ignoreMoveRef = useRef(false);
  const paneClickRef = useRef(false);
  const prevSelectedRef = useRef<string | null>(null);

  const [nodes, setNodes] = useState<ServiceNodeType[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const savedServiceIdsRef = useRef<Set<string>>(
    new Set(Object.keys(initialPositions)),
  );
  const updatePositionRef = useRef(updatePosition);
  updatePositionRef.current = updatePosition;

  useEffect(() => {
    const newServicePositions: Array<{
      id: string;
      x: number;
      y: number;
    }> = [];

    const newNodes = services.map((service) => {
      const pos = getPosition(service.id);
      const data: ServiceNodeData = {
        service,
        domain: domains[service.id] || null,
        serverIp,
        isSelected: selectedServiceId === service.id,
      };

      if (!savedServiceIdsRef.current.has(service.id)) {
        newServicePositions.push({ id: service.id, x: pos.x, y: pos.y });
        savedServiceIdsRef.current.add(service.id);
      }

      return {
        id: service.id,
        type: "service" as const,
        position: pos,
        data,
      };
    });

    setNodes(newNodes);

    if (newServicePositions.length > 0) {
      requestAnimationFrame(() => {
        for (const { id, x, y } of newServicePositions) {
          updatePositionRef.current(id, x, y);
        }
      });
    }
  }, [domains, serverIp, selectedServiceId, getPosition, services]);

  useEffect(() => {
    const wasSelected = prevSelectedRef.current !== null;
    const isNowDeselected = selectedServiceId === null;
    const isNewSelection =
      selectedServiceId !== null &&
      prevSelectedRef.current !== selectedServiceId;

    if (wasSelected && isNowDeselected && !canvasMovedRef.current) {
      setTimeout(() => {
        ignoreMoveRef.current = true;
        fitView({ maxZoom: 1.25, duration: 200 });
      }, 150);
    }

    if (isNewSelection) {
      const node = nodes.find((n) => n.id === selectedServiceId);
      const container = containerRef.current;
      if (node && container) {
        canvasMovedRef.current = false;
        ignoreMoveRef.current = true;
        const viewport = calculateViewportForNode(
          node.position,
          container.offsetWidth,
          container.offsetHeight,
          getZoom(),
        );
        setViewport(viewport, { duration: 300 });
      }
    }

    prevSelectedRef.current = selectedServiceId;
  }, [selectedServiceId, fitView, nodes, getZoom, setViewport]);

  function onNodesChange(changes: NodeChange<ServiceNodeType>[]): void {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }

  function onNodeDragStop(
    _: unknown,
    node: { id: string; position: { x: number; y: number } },
  ): void {
    updatePosition(node.id, node.position.x, node.position.y);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!selectedServiceId) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const delta = ARROW_KEY_DELTAS[e.key];
      if (!delta) return;

      e.preventDefault();
      const [dx, dy] = delta;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedServiceId) return n;
          const newPos = {
            x: n.position.x + dx * GRID_SIZE,
            y: n.position.y + dy * GRID_SIZE,
          };
          updatePosition(n.id, newPos.x, newPos.y);
          return { ...n, position: newPos };
        }),
      );
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedServiceId, updatePosition]);

  function onNodeClick(_: unknown, node: { id: string }): void {
    onSelectService(node.id);
  }

  function onMoveEnd(): void {
    if (ignoreMoveRef.current) {
      ignoreMoveRef.current = false;
      return;
    }
    if (paneClickRef.current) {
      paneClickRef.current = false;
      return;
    }
    if (selectedServiceId) {
      canvasMovedRef.current = true;
    }
  }

  function onPaneClick(): void {
    paneClickRef.current = true;
    canvasMovedRef.current = false;
    onSelectService(null);
    setContextMenu(null);
  }

  function onNodeContextMenu(
    event: React.MouseEvent,
    node: { id: string },
  ): void {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, serviceId: node.id });
  }

  async function handleDeleteService(): Promise<void> {
    if (!contextMenu) return;
    if (!confirm("Delete this service? This cannot be undone.")) {
      setContextMenu(null);
      return;
    }
    try {
      await deleteMutation.mutateAsync(contextMenu.serviceId);
      toast.success("Service deleted");
      if (selectedServiceId === contextMenu.serviceId) {
        onSelectService(null);
      }
    } catch {
      toast.error("Failed to delete service");
    }
    setContextMenu(null);
  }

  useEffect(() => {
    function handleClickOutside(): void {
      setContextMenu(null);
    }
    if (contextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu]);

  if (services.length === 0) {
    return (
      <div ref={containerRef} className="relative h-full w-full bg-neutral-950">
        <ReactFlow
          nodes={[]}
          edges={[]}
          fitView
          minZoom={0.25}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={GRID_SIZE}
            size={1}
            color="#404040"
          />
        </ReactFlow>
        <div className="absolute inset-0 flex items-center justify-center">
          <Card className="border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
            <CardContent className="flex flex-col items-center gap-4 p-8">
              <h2 className="text-lg font-medium text-neutral-200">
                What will you build?
              </h2>
              <Button variant="outline" onClick={onOpenCreateModal}>
                <Plus className="mr-1.5 h-4 w-4" />
                Create
              </Button>
            </CardContent>
          </Card>
        </div>
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
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        fitView
        fitViewOptions={{ maxZoom: 1.25 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1}
          color="#404040"
        />
      </ReactFlow>
      <CanvasControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={() => fitView({ maxZoom: 1.25 })}
      />
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={handleDeleteService}
            disabled={deleteMutation.isPending}
            className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-red-400 hover:bg-neutral-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete Service
          </button>
        </div>
      )}
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
