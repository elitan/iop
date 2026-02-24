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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type CanvasPositions,
  useCanvasPositions,
} from "@/hooks/use-canvas-positions";
import { useDeleteDatabase } from "@/hooks/use-databases";
import { useDeleteService } from "@/hooks/use-services";
import type { Service } from "@/lib/api";
import { CanvasControls } from "./canvas-controls";
import type {
  CanvasDatabase,
  CanvasDatabaseAttachment,
} from "./database-content";
import {
  DatabaseNode,
  type DatabaseNodeData,
  type DatabaseNodeType,
} from "./database-node";
import {
  ServiceNode,
  type ServiceNodeData,
  type ServiceNodeType,
} from "./service-node";

type CanvasResourceType = "service" | "database";

interface ContextMenuState {
  x: number;
  y: number;
  resourceType: CanvasResourceType;
  resourceId: string;
}

const GRID_SIZE = 20;
const NODE_WIDTH = 256;
const NODE_HEIGHT = 100;
const DATABASE_NODE_PREFIX = "database:";
const nodeTypes = { service: ServiceNode, database: DatabaseNode } as const;

type CanvasNodeType = ServiceNodeType | DatabaseNodeType;

function toDatabaseNodeId(databaseId: string): string {
  return `${DATABASE_NODE_PREFIX}${databaseId}`;
}

function fromDatabaseNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith(DATABASE_NODE_PREFIX)) {
    return null;
  }
  return nodeId.slice(DATABASE_NODE_PREFIX.length);
}

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
  databases: CanvasDatabase[];
  databaseAttachments: CanvasDatabaseAttachment[];
  initialPositions: CanvasPositions;
  domains: Record<string, string>;
  serverIp: string | null;
  selectedServiceId: string | null;
  selectedDatabaseId: string | null;
  onSelectService: (serviceId: string | null) => void;
  onSelectDatabase: (databaseId: string | null) => void;
  onOpenCreateModal: () => void;
}

function CanvasViewInner({
  projectId,
  environmentId,
  services,
  databases,
  databaseAttachments,
  initialPositions,
  domains,
  serverIp,
  selectedServiceId,
  selectedDatabaseId,
  onSelectService,
  onSelectDatabase,
  onOpenCreateModal,
}: CanvasViewProps) {
  const { updatePosition, getPosition } = useCanvasPositions(
    projectId,
    initialPositions,
  );
  const { fitView, zoomIn, zoomOut, setViewport, getZoom } = useReactFlow();
  const deleteServiceMutation = useDeleteService(environmentId);
  const deleteDatabaseMutation = useDeleteDatabase(projectId);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMovedRef = useRef(false);
  const ignoreMoveRef = useRef(false);
  const paneClickRef = useRef(false);
  const prevSelectedRef = useRef<string | null>(null);
  const selectedNodeId = selectedServiceId
    ? selectedServiceId
    : selectedDatabaseId
      ? toDatabaseNodeId(selectedDatabaseId)
      : null;

  const [nodes, setNodes] = useState<CanvasNodeType[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<{
    type: CanvasResourceType;
    id: string;
  } | null>(null);
  const savedNodeIdsRef = useRef<Set<string>>(
    new Set(Object.keys(initialPositions)),
  );
  const updatePositionRef = useRef(updatePosition);
  updatePositionRef.current = updatePosition;

  useEffect(() => {
    const newNodePositions: Array<{
      id: string;
      x: number;
      y: number;
    }> = [];

    const attachmentsByDatabaseId = new Map(
      databaseAttachments.map((attachment) => [
        attachment.databaseId,
        attachment,
      ]),
    );

    const serviceNodes = services.map((service) => {
      const pos = getPosition(service.id);
      const data: ServiceNodeData = {
        service,
        domain: domains[service.id] || null,
        serverIp,
        isSelected: selectedServiceId === service.id,
      };

      if (!savedNodeIdsRef.current.has(service.id)) {
        newNodePositions.push({ id: service.id, x: pos.x, y: pos.y });
        savedNodeIdsRef.current.add(service.id);
      }

      return {
        id: service.id,
        type: "service" as const,
        position: pos,
        data,
      };
    });

    const databaseNodes = databases.map((database) => {
      const nodeId = toDatabaseNodeId(database.id);
      const pos = getPosition(nodeId);
      const data: DatabaseNodeData = {
        database,
        attachment: attachmentsByDatabaseId.get(database.id) ?? null,
        isSelected: selectedDatabaseId === database.id,
      };

      if (!savedNodeIdsRef.current.has(nodeId)) {
        newNodePositions.push({ id: nodeId, x: pos.x, y: pos.y });
        savedNodeIdsRef.current.add(nodeId);
      }

      return {
        id: nodeId,
        type: "database" as const,
        position: pos,
        data,
      };
    });

    setNodes([...serviceNodes, ...databaseNodes]);

    if (newNodePositions.length > 0) {
      requestAnimationFrame(() => {
        for (const { id, x, y } of newNodePositions) {
          updatePositionRef.current(id, x, y);
        }
      });
    }
  }, [
    databaseAttachments,
    databases,
    domains,
    getPosition,
    selectedDatabaseId,
    selectedServiceId,
    serverIp,
    services,
  ]);

  useEffect(() => {
    const wasSelected = prevSelectedRef.current !== null;
    const isNowDeselected = selectedNodeId === null;
    const isNewSelection =
      selectedNodeId !== null && prevSelectedRef.current !== selectedNodeId;

    if (wasSelected && isNowDeselected && !canvasMovedRef.current) {
      setTimeout(() => {
        ignoreMoveRef.current = true;
        fitView({ maxZoom: 1.25, duration: 200 });
      }, 150);
    }

    if (isNewSelection) {
      const node = nodes.find((n) => n.id === selectedNodeId);
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

    prevSelectedRef.current = selectedNodeId;
  }, [fitView, getZoom, nodes, selectedNodeId, setViewport]);

  function onNodesChange(changes: NodeChange<CanvasNodeType>[]): void {
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
      if (!selectedNodeId) return;
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
          if (n.id !== selectedNodeId) return n;
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
  }, [selectedNodeId, updatePosition]);

  function onNodeClick(_: unknown, node: { id: string }): void {
    const databaseId = fromDatabaseNodeId(node.id);
    if (databaseId) {
      onSelectDatabase(databaseId);
      return;
    }
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
    if (selectedNodeId) {
      canvasMovedRef.current = true;
    }
  }

  function onPaneClick(): void {
    paneClickRef.current = true;
    canvasMovedRef.current = false;
    if (selectedServiceId) {
      onSelectService(null);
    } else if (selectedDatabaseId) {
      onSelectDatabase(null);
    }
    setContextMenu(null);
  }

  function onNodeContextMenu(
    event: React.MouseEvent,
    node: { id: string },
  ): void {
    event.preventDefault();

    const databaseId = fromDatabaseNodeId(node.id);
    if (databaseId) {
      onSelectService(null);
      onSelectDatabase(databaseId);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        resourceType: "database",
        resourceId: databaseId,
      });
      return;
    }

    onSelectDatabase(null);
    onSelectService(node.id);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      resourceType: "service",
      resourceId: node.id,
    });
  }

  function handleDeleteResource(): void {
    if (!contextMenu) return;
    setResourceToDelete({
      type: contextMenu.resourceType,
      id: contextMenu.resourceId,
    });
    setContextMenu(null);
  }

  async function handleConfirmDeleteResource(): Promise<void> {
    if (!resourceToDelete) return;

    try {
      if (resourceToDelete.type === "service") {
        await deleteServiceMutation.mutateAsync(resourceToDelete.id);
        toast.success("Service deleted");
        if (selectedServiceId === resourceToDelete.id) {
          onSelectService(null);
        }
      } else {
        await deleteDatabaseMutation.mutateAsync(resourceToDelete.id);
        toast.success("Database deleted");
        if (selectedDatabaseId === resourceToDelete.id) {
          onSelectDatabase(null);
        }
      }
      setResourceToDelete(null);
    } catch {
      toast.error(
        `Failed to delete ${resourceToDelete.type === "service" ? "service" : "database"}`,
      );
    }
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

  if (services.length === 0 && databases.length === 0) {
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
            onClick={handleDeleteResource}
            disabled={
              deleteServiceMutation.isPending ||
              deleteDatabaseMutation.isPending
            }
            className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-red-400 hover:bg-neutral-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {contextMenu.resourceType === "service"
              ? "Delete Service"
              : "Delete Database"}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={resourceToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setResourceToDelete(null);
        }}
        title={
          resourceToDelete
            ? `Delete ${resourceToDelete.type}`
            : "Delete resource"
        }
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={
          deleteServiceMutation.isPending || deleteDatabaseMutation.isPending
        }
        onConfirm={handleConfirmDeleteResource}
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
