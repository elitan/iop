import { describe, expect, test } from "bun:test";
import {
  deriveServiceName,
  findDockerfiles,
  findFrostFiles,
  type GitHubTreeEntry,
  normalizeGitHubUrl,
  parseDockerfilePort,
  parseOwnerRepoFromUrl,
} from "./github";

function entry(path: string, type: "blob" | "tree" = "blob"): GitHubTreeEntry {
  return { path, type, sha: "abc123" };
}

describe("normalizeGitHubUrl", () => {
  test("strips .git suffix", () => {
    expect(normalizeGitHubUrl("https://github.com/user/repo.git")).toBe(
      "https://github.com/user/repo",
    );
  });

  test("converts SSH to HTTPS format", () => {
    expect(normalizeGitHubUrl("git@github.com:user/repo.git")).toBe(
      "https://github.com/user/repo",
    );
  });

  test("handles URL without .git", () => {
    expect(normalizeGitHubUrl("https://github.com/user/repo")).toBe(
      "https://github.com/user/repo",
    );
  });

  test("handles SSH without .git", () => {
    expect(normalizeGitHubUrl("git@github.com:user/repo")).toBe(
      "https://github.com/user/repo",
    );
  });
});

describe("parseOwnerRepoFromUrl", () => {
  test("parses HTTPS URL", () => {
    const result = parseOwnerRepoFromUrl("https://github.com/elitan/frost");
    expect(result).toEqual({ owner: "elitan", repo: "frost" });
  });

  test("parses HTTPS URL with .git", () => {
    const result = parseOwnerRepoFromUrl("https://github.com/elitan/frost.git");
    expect(result).toEqual({ owner: "elitan", repo: "frost" });
  });

  test("parses SSH URL", () => {
    const result = parseOwnerRepoFromUrl("git@github.com:elitan/frost.git");
    expect(result).toEqual({ owner: "elitan", repo: "frost" });
  });

  test("returns null for invalid URL", () => {
    expect(parseOwnerRepoFromUrl("not-a-github-url")).toBeNull();
    expect(parseOwnerRepoFromUrl("https://gitlab.com/user/repo")).toBeNull();
  });

  test("handles repos with hyphens and numbers", () => {
    const result = parseOwnerRepoFromUrl(
      "https://github.com/my-org/my-repo-123",
    );
    expect(result).toEqual({ owner: "my-org", repo: "my-repo-123" });
  });
});

describe("findDockerfiles", () => {
  test("finds root Dockerfile", () => {
    const tree = [entry("Dockerfile"), entry("README.md")];
    expect(findDockerfiles(tree)).toEqual(["Dockerfile"]);
  });

  test("finds nested Dockerfiles", () => {
    const tree = [
      entry("apps/api/Dockerfile"),
      entry("apps/web/Dockerfile"),
      entry("README.md"),
    ];
    expect(findDockerfiles(tree)).toEqual([
      "apps/api/Dockerfile",
      "apps/web/Dockerfile",
    ]);
  });

  test("finds Dockerfile.suffix variants", () => {
    const tree = [entry("Dockerfile.worker"), entry("Dockerfile.api")];
    expect(findDockerfiles(tree)).toEqual([
      "Dockerfile.worker",
      "Dockerfile.api",
    ]);
  });

  test("ignores directories", () => {
    const tree = [entry("Dockerfile", "tree"), entry("app/Dockerfile")];
    expect(findDockerfiles(tree)).toEqual(["app/Dockerfile"]);
  });

  test("ignores files containing Dockerfile in name", () => {
    const tree = [
      entry("Dockerfile"),
      entry("Dockerfile.bak"),
      entry("NotADockerfile"),
    ];
    expect(findDockerfiles(tree)).toEqual(["Dockerfile", "Dockerfile.bak"]);
  });
});

describe("deriveServiceName", () => {
  test("root Dockerfile uses repo name", () => {
    expect(deriveServiceName("Dockerfile", "my-app")).toBe("my-app");
  });

  test("nested Dockerfile uses parent directory", () => {
    expect(deriveServiceName("apps/api/Dockerfile", "monorepo")).toBe("api");
    expect(deriveServiceName("apps/web/Dockerfile", "monorepo")).toBe("web");
    expect(deriveServiceName("services/backend/Dockerfile", "proj")).toBe(
      "backend",
    );
  });

  test("Dockerfile.suffix uses suffix as name", () => {
    expect(deriveServiceName("Dockerfile.worker", "my-app")).toBe("worker");
    expect(deriveServiceName("Dockerfile.api", "my-app")).toBe("api");
  });

  test("nested Dockerfile.suffix uses suffix", () => {
    expect(deriveServiceName("apps/Dockerfile.web", "monorepo")).toBe("web");
  });
});

describe("parseDockerfilePort", () => {
  test("parses EXPOSE directive", () => {
    expect(parseDockerfilePort("FROM node\nEXPOSE 3000\nCMD node")).toBe(3000);
    expect(parseDockerfilePort("EXPOSE 8080")).toBe(8080);
  });

  test("parses ENV PORT with equals", () => {
    expect(parseDockerfilePort("FROM node\nENV PORT=4000")).toBe(4000);
  });

  test("parses ENV PORT with space", () => {
    expect(parseDockerfilePort("FROM node\nENV PORT 5000")).toBe(5000);
  });

  test("returns first port found", () => {
    const content = `
FROM node
EXPOSE 3000
EXPOSE 8080
`;
    expect(parseDockerfilePort(content)).toBe(3000);
  });

  test("returns null when no port found", () => {
    expect(parseDockerfilePort("FROM node\nCMD npm start")).toBeNull();
    expect(parseDockerfilePort("")).toBeNull();
  });

  test("handles case insensitivity", () => {
    expect(parseDockerfilePort("expose 3000")).toBe(3000);
    expect(parseDockerfilePort("env port=4000")).toBe(4000);
  });

  test("ignores commented lines", () => {
    expect(parseDockerfilePort("# EXPOSE 3000\nEXPOSE 8080")).toBe(8080);
  });
});

describe("findFrostFiles", () => {
  test("finds root frost.yaml", () => {
    const tree = [entry("frost.yaml"), entry("Dockerfile")];
    expect(findFrostFiles(tree)).toEqual(["frost.yaml"]);
  });

  test("finds root frost.yml", () => {
    const tree = [entry("frost.yml"), entry("Dockerfile")];
    expect(findFrostFiles(tree)).toEqual(["frost.yml"]);
  });

  test("finds nested frost files", () => {
    const tree = [
      entry("apps/api/frost.yaml"),
      entry("apps/web/frost.yml"),
      entry("apps/api/Dockerfile"),
    ];
    expect(findFrostFiles(tree)).toEqual([
      "apps/api/frost.yaml",
      "apps/web/frost.yml",
    ]);
  });

  test("ignores directories", () => {
    const tree = [entry("frost.yaml", "tree"), entry("app/frost.yaml")];
    expect(findFrostFiles(tree)).toEqual(["app/frost.yaml"]);
  });

  test("ignores files with similar names", () => {
    const tree = [
      entry("frost.yaml"),
      entry("frost.yaml.bak"),
      entry("my-frost.yaml"),
      entry("frost.yml"),
    ];
    expect(findFrostFiles(tree)).toEqual(["frost.yaml", "frost.yml"]);
  });

  test("returns empty array when no frost files", () => {
    const tree = [entry("Dockerfile"), entry("README.md")];
    expect(findFrostFiles(tree)).toEqual([]);
  });
});
