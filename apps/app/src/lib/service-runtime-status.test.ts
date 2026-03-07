import { describe, expect, test } from "bun:test";
import { getServiceRuntimeState } from "./service-runtime-status";

type LatestDeploymentStatus = Exclude<
  Parameters<typeof getServiceRuntimeState>[0]["latestDeployment"],
  null
>["status"];

function latestDeployment(id: string, status: LatestDeploymentStatus) {
  return { id, status };
}

describe("getServiceRuntimeState", () => {
  test("returns not-deployed when there is no deployment", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: null,
        latestDeployment: null,
      }),
    ).toEqual({
      runtimeStatus: "not-deployed",
      attentionStatus: null,
    });
  });

  test("returns starting for first deploy in progress", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: null,
        latestDeployment: latestDeployment("d-1", "building"),
      }),
    ).toEqual({
      runtimeStatus: "starting",
      attentionStatus: null,
    });
  });

  test("returns online with no attention for running current deploy", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: "d-1",
        latestDeployment: latestDeployment("d-1", "running"),
      }),
    ).toEqual({
      runtimeStatus: "online",
      attentionStatus: null,
    });
  });

  test("returns online with updating attention for newer in-progress deploy", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: "d-1",
        latestDeployment: latestDeployment("d-2", "deploying"),
      }),
    ).toEqual({
      runtimeStatus: "online",
      attentionStatus: "updating",
    });
  });

  test("returns online with failed attention for newer failed deploy", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: "d-1",
        latestDeployment: latestDeployment("d-2", "failed"),
      }),
    ).toEqual({
      runtimeStatus: "online",
      attentionStatus: "last-deploy-failed",
    });
  });

  test("returns offline after failed latest deploy with no current deploy", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: null,
        latestDeployment: latestDeployment("d-2", "failed"),
      }),
    ).toEqual({
      runtimeStatus: "offline",
      attentionStatus: null,
    });
  });

  test("returns offline after stopped latest deploy with no current deploy", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: null,
        latestDeployment: latestDeployment("d-2", "stopped"),
      }),
    ).toEqual({
      runtimeStatus: "offline",
      attentionStatus: null,
    });
  });

  test("returns offline after cancelled latest deploy with no current deploy", () => {
    expect(
      getServiceRuntimeState({
        currentDeploymentId: null,
        latestDeployment: latestDeployment("d-2", "cancelled"),
      }),
    ).toEqual({
      runtimeStatus: "offline",
      attentionStatus: null,
    });
  });
});
