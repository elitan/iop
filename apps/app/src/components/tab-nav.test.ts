import { describe, expect, test } from "bun:test";
import { getPathFromHref, isTabActive } from "./tab-nav";

describe("getPathFromHref", () => {
  test("returns path as-is when no query string", () => {
    expect(getPathFromHref("/projects/123")).toBe("/projects/123");
  });

  test("strips query string", () => {
    expect(getPathFromHref("/projects/123/settings?env=abc")).toBe(
      "/projects/123/settings",
    );
  });

  test("handles multiple query params", () => {
    expect(getPathFromHref("/foo?a=1&b=2")).toBe("/foo");
  });

  test("handles empty path with query", () => {
    expect(getPathFromHref("?foo=bar")).toBe("");
  });
});

describe("isTabActive", () => {
  const overviewPath = "/projects/123/environments/456";
  const settingsPath = "/projects/123/settings";

  test("exact match returns true", () => {
    expect(
      isTabActive("/projects/123/settings", settingsPath, overviewPath),
    ).toBe(true);
  });

  test("first tab only matches exactly", () => {
    expect(isTabActive(overviewPath, overviewPath, overviewPath)).toBe(true);
    expect(
      isTabActive(
        "/projects/123/environments/456/sub",
        overviewPath,
        overviewPath,
      ),
    ).toBe(false);
  });

  test("non-first tabs match nested routes", () => {
    expect(
      isTabActive("/projects/123/settings/general", settingsPath, overviewPath),
    ).toBe(true);
    expect(
      isTabActive("/projects/123/settings/danger", settingsPath, overviewPath),
    ).toBe(true);
  });

  test("different paths don't match", () => {
    expect(isTabActive("/projects/123/other", settingsPath, overviewPath)).toBe(
      false,
    );
  });

  test("settings page with env query matches settings tab", () => {
    const pathname = "/projects/123/settings";
    const tabPath = "/projects/123/settings";
    expect(isTabActive(pathname, tabPath, overviewPath)).toBe(true);
  });
});
