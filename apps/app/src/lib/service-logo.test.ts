import { describe, expect, test } from "bun:test";
import { FALLBACK_ICON, getServiceIcon } from "./service-logo";

describe("getServiceIcon", () => {
  test("returns icon url when service has icon field", () => {
    const service = { name: "myapp", icon: "postgresql" };
    expect(getServiceIcon(service)).toBe(
      "https://cdn.simpleicons.org/postgresql",
    );
  });

  test("uses white color for dark icons", () => {
    expect(getServiceIcon({ name: "app", icon: "nextdotjs" })).toBe(
      "https://cdn.simpleicons.org/nextdotjs/ffffff",
    );
    expect(getServiceIcon({ name: "app", icon: "ghost" })).toBe(
      "https://cdn.simpleicons.org/ghost/ffffff",
    );
    expect(getServiceIcon({ name: "app", icon: "umami" })).toBe(
      "https://cdn.simpleicons.org/umami/ffffff",
    );
  });

  test("returns icon url for various icon slugs", () => {
    expect(getServiceIcon({ name: "db", icon: "postgresql" })).toBe(
      "https://cdn.simpleicons.org/postgresql",
    );
    expect(getServiceIcon({ name: "cache", icon: "redis" })).toBe(
      "https://cdn.simpleicons.org/redis",
    );
    expect(getServiceIcon({ name: "app", icon: "react" })).toBe(
      "https://cdn.simpleicons.org/react",
    );
  });

  test("falls back to keyword detection when no icon field", () => {
    const service = { name: "postgres-db", imageUrl: "postgres:17" };
    expect(getServiceIcon(service)).toBe(
      "https://cdn.simpleicons.org/postgresql",
    );
  });

  test("keyword detection from service name", () => {
    expect(getServiceIcon({ name: "redis-cache" })).toBe(
      "https://cdn.simpleicons.org/redis",
    );
    expect(getServiceIcon({ name: "my-postgres" })).toBe(
      "https://cdn.simpleicons.org/postgresql",
    );
  });

  test("keyword detection from image url", () => {
    expect(getServiceIcon({ name: "db", imageUrl: "mysql:8" })).toBe(
      "https://cdn.simpleicons.org/mysql",
    );
    expect(getServiceIcon({ name: "store", imageUrl: "mongo:7" })).toBe(
      "https://cdn.simpleicons.org/mongodb",
    );
  });

  test("returns null when no match found", () => {
    const service = { name: "custom-app", imageUrl: "myorg/myapp:latest" };
    expect(getServiceIcon(service)).toBeNull();
  });

  test("icon field takes priority over keyword detection", () => {
    const service = {
      name: "postgres-something",
      imageUrl: "redis:7",
      icon: "mysql",
    };
    expect(getServiceIcon(service)).toBe("https://cdn.simpleicons.org/mysql");
  });

  test("handles null icon field", () => {
    const service = { name: "redis-cache", icon: null };
    expect(getServiceIcon(service)).toBe("https://cdn.simpleicons.org/redis");
  });

  test("handles undefined icon field", () => {
    const service = { name: "nginx-proxy", icon: undefined };
    expect(getServiceIcon(service)).toBe("https://cdn.simpleicons.org/nginx");
  });
});

describe("FALLBACK_ICON", () => {
  test("is a grayed docker icon", () => {
    expect(FALLBACK_ICON).toBe("https://cdn.simpleicons.org/docker/666666");
  });
});
