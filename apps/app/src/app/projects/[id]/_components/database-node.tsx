"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type CanvasDatabase,
  type CanvasDatabaseAttachment,
  DatabaseContent,
} from "./database-content";

export type DatabaseNodeData = {
  database: CanvasDatabase;
  attachment: CanvasDatabaseAttachment | null;
  isSelected: boolean;
  [key: string]: unknown;
};

export type DatabaseNodeType = Node<DatabaseNodeData, "database">;

export function DatabaseNode({ data }: NodeProps<DatabaseNodeType>) {
  const { database, attachment, isSelected } = data;

  return (
    <>
      <Handle type="target" position={Position.Left} className="invisible" />
      <Card
        className={cn(
          "w-64 cursor-pointer border-neutral-800 bg-neutral-900 transition-colors",
          isSelected
            ? "border-blue-500 ring-1 ring-blue-500"
            : "hover:border-neutral-700",
        )}
      >
        <CardContent className="flex flex-col p-4">
          <DatabaseContent database={database} attachment={attachment} />
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Right} className="invisible" />
    </>
  );
}
