import { useCallback, useRef } from "react";
import { useUpdateProject } from "./use-projects";

export type CanvasPositions = Record<string, { x: number; y: number }>;

const NODE_HEIGHT = 100;
const GAP = 40;

function calculateNewPosition(existingPositions: CanvasPositions): {
  x: number;
  y: number;
} {
  const positionValues = Object.values(existingPositions);
  if (positionValues.length === 0) {
    return { x: 50, y: 50 };
  }

  let maxY = -Infinity;
  let xAtMaxY = 50;
  for (const pos of positionValues) {
    if (pos.y > maxY) {
      maxY = pos.y;
      xAtMaxY = pos.x;
    }
  }

  return { x: xAtMaxY, y: maxY + NODE_HEIGHT + GAP };
}

export function useCanvasPositions(
  projectId: string,
  initialPositions: CanvasPositions,
) {
  const positionsRef = useRef<CanvasPositions>(initialPositions);
  const updateProject = useUpdateProject(projectId);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(
    (serviceId: string, x: number, y: number) => {
      const updated = { ...positionsRef.current, [serviceId]: { x, y } };
      positionsRef.current = updated;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        updateProject.mutate({ canvasPositions: JSON.stringify(updated) });
      }, 500);
    },
    [updateProject],
  );

  const getPosition = useCallback((serviceId: string) => {
    if (positionsRef.current[serviceId]) {
      return positionsRef.current[serviceId];
    }
    const newPos = calculateNewPosition(positionsRef.current);
    positionsRef.current = { ...positionsRef.current, [serviceId]: newPos };
    return newPos;
  }, []);

  return { updatePosition, getPosition };
}
