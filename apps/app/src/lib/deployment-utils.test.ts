import { describe, expect, test } from "bun:test";
import type { Deployment } from "@/lib/api";
import { getCurrentDeployment } from "./deployment-utils";

function deployment(id: string, status: string): Deployment {
  return { id, status } as Deployment;
}

describe("getCurrentDeployment", () => {
  test("returns current deployment when active", () => {
    const result = getCurrentDeployment({ currentDeploymentId: "d-1" }, [
      deployment("d-1", "running"),
      deployment("d-2", "stopped"),
    ]);

    expect(result?.id).toBe("d-1");
  });

  test("returns null when current deployment is stopped", () => {
    const result = getCurrentDeployment({ currentDeploymentId: "d-1" }, [
      deployment("d-1", "stopped"),
    ]);

    expect(result).toBeNull();
  });

  test("falls back to active deployment when current id is missing", () => {
    const result = getCurrentDeployment({ currentDeploymentId: null }, [
      deployment("d-2", "stopped"),
      deployment("d-3", "running"),
    ]);

    expect(result?.id).toBe("d-3");
  });
});
