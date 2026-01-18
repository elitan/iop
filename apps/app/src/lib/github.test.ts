import { describe, expect, test } from "bun:test";
import { normalizeGitHubUrl, parseOwnerRepoFromUrl } from "./github";

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
