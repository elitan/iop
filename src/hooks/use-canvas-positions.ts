import { useCallback, useRef, useState } from "react";
import { useUpdateProject } from "./use-projects";

export type CanvasPositions = Record<string, { x: number; y: number }>;

export function useCanvasPositions(
  projectId: string,
  initialPositions: CanvasPositions,
) {
  const [positions, setPositions] = useState<CanvasPositions>(initialPositions);
  const updateProject = useUpdateProject(projectId);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(
    (serviceId: string, x: number, y: number) => {
      setPositions((prev) => {
        const updated = { ...prev, [serviceId]: { x, y } };

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
          updateProject.mutate({ canvasPositions: JSON.stringify(updated) });
        }, 500);

        return updated;
      });
    },
    [updateProject],
  );

  const getPosition = useCallback(
    (serviceId: string, index: number) => {
      if (positions[serviceId]) {
        return positions[serviceId];
      }
      const col = index % 3;
      const row = Math.floor(index / 3);
      return { x: 50 + col * 300, y: 50 + row * 200 };
    },
    [positions],
  );

  return { positions, updatePosition, getPosition };
}
