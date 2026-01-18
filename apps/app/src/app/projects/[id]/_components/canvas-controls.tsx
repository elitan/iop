"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}

export function CanvasControls({
  onZoomIn,
  onZoomOut,
  onFitView,
}: CanvasControlsProps) {
  return (
    <div className="absolute bottom-4 left-4 flex gap-1 rounded-lg bg-neutral-800/80 p-1 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onZoomIn}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onZoomOut}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onFitView}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
