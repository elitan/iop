import { describe, expect, test } from "bun:test";

describe("cleanup utilities", () => {
  test("groups images by service prefix", () => {
    const images = [
      "frost-proj1-api:abc123",
      "frost-proj1-api:def456",
      "frost-proj1-api:ghi789",
      "frost-proj1-web:abc123",
      "frost-proj2-api:xyz999",
    ];

    const imagesByService = new Map<string, string[]>();
    for (const image of images) {
      const match = image.match(/^(frost-[^:]+):/);
      if (!match) continue;
      const servicePrefix = match[1];
      const list = imagesByService.get(servicePrefix) || [];
      list.push(image);
      imagesByService.set(servicePrefix, list);
    }

    expect(imagesByService.get("frost-proj1-api")).toEqual([
      "frost-proj1-api:abc123",
      "frost-proj1-api:def456",
      "frost-proj1-api:ghi789",
    ]);
    expect(imagesByService.get("frost-proj1-web")).toEqual([
      "frost-proj1-web:abc123",
    ]);
    expect(imagesByService.get("frost-proj2-api")).toEqual([
      "frost-proj2-api:xyz999",
    ]);
  });

  test("selects images to delete based on keep count", () => {
    const images = [
      { name: "frost-api:v3", created: new Date("2024-01-03") },
      { name: "frost-api:v1", created: new Date("2024-01-01") },
      { name: "frost-api:v2", created: new Date("2024-01-02") },
    ];

    images.sort((a, b) => b.created.getTime() - a.created.getTime());

    const keepCount = 2;
    const toDelete = images.slice(keepCount);

    expect(toDelete).toEqual([
      { name: "frost-api:v1", created: new Date("2024-01-01") },
    ]);
  });

  test("skips running images", () => {
    const runningImages = new Set(["frost-api:v3"]);
    const toDelete = [
      { name: "frost-api:v1" },
      { name: "frost-api:v2" },
      { name: "frost-api:v3" },
    ];

    const filtered = toDelete.filter((img) => !runningImages.has(img.name));

    expect(filtered).toEqual([
      { name: "frost-api:v1" },
      { name: "frost-api:v2" },
    ]);
  });

  test("formats bytes correctly", () => {
    function formatBytes(bytes: number): string {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
    }

    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500.0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });
});
