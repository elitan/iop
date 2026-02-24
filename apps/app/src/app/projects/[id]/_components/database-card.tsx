"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  type CanvasDatabase,
  type CanvasDatabaseAttachment,
  DatabaseContent,
} from "./database-content";

interface DatabaseCardProps {
  database: CanvasDatabase;
  attachment: CanvasDatabaseAttachment | null;
  onOpen: (databaseId: string) => void;
}

export function DatabaseCard({
  database,
  attachment,
  onOpen,
}: DatabaseCardProps) {
  return (
    <button
      type="button"
      className="h-full text-left"
      onClick={() => onOpen(database.id)}
    >
      <Card className="h-full cursor-pointer border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700">
        <CardContent className="flex h-full flex-col p-4">
          <DatabaseContent database={database} attachment={attachment} />
        </CardContent>
      </Card>
    </button>
  );
}
