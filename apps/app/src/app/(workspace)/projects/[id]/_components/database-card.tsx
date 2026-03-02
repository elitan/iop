"use client";

import { Card, CardContent } from "@/components/ui/card";
import { type CanvasDatabase, DatabaseContent } from "./database-content";

interface DatabaseCardProps {
  database: CanvasDatabase;
  onOpen: (databaseId: string) => void;
}

export function DatabaseCard({ database, onOpen }: DatabaseCardProps) {
  return (
    <button
      type="button"
      className="h-full text-left"
      onClick={() => onOpen(database.id)}
    >
      <Card className="h-full cursor-pointer border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700">
        <CardContent className="flex h-full flex-col p-4">
          <DatabaseContent database={database} />
        </CardContent>
      </Card>
    </button>
  );
}
