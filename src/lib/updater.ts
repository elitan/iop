import { exec } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import pkg from "../../package.json";
import { getSetting, setSetting } from "./auth";

const execAsync = promisify(exec);

const REPO_OWNER = "elitan";
const REPO_NAME = "frost";
const GITHUB_API = "https://api.github.com";
const UPDATE_MARKER_PATH = "/opt/frost/data/.update-requested";
const UPDATE_LOG_PATH = "/opt/frost/data/.update-log";
const UPDATE_RESULT_PATH = "/opt/frost/data/.update-result";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

interface GitHubContent {
  name: string;
  sha: string;
  type: string;
}

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  hasMigrations: boolean;
  htmlUrl: string | null;
  lastCheck: number | null;
}

export function getCurrentVersion(): string {
  return pkg.version;
}

export function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const cleaned = v.replace(/^v/, "");
    const parts = cleaned.split(".").map((p) => Number.parseInt(p, 10) || 0);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
    };
  };

  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) return vA.major - vB.major;
  if (vA.minor !== vB.minor) return vA.minor - vB.minor;
  return vA.patch - vB.patch;
}

export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Frost-Updater",
        },
      },
    );

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    return (await res.json()) as GitHubRelease;
  } catch (err) {
    console.error("Failed to fetch latest release:", err);
    return null;
  }
}

async function fetchSchemaFiles(ref: string): Promise<GitHubContent[] | null> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/schema?ref=${ref}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Frost-Updater",
        },
      },
    );

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as GitHubContent[];
  } catch {
    return null;
  }
}

export async function detectMigrations(
  currentVersion: string,
  newVersion: string,
): Promise<boolean> {
  const currentRef = `v${currentVersion.replace(/^v/, "")}`;
  const newRef = `v${newVersion.replace(/^v/, "")}`;

  const [currentFiles, newFiles] = await Promise.all([
    fetchSchemaFiles(currentRef),
    fetchSchemaFiles(newRef),
  ]);

  if (!currentFiles || !newFiles) {
    return false;
  }

  if (currentFiles.length !== newFiles.length) {
    return true;
  }

  const currentShas = new Set(currentFiles.map((f) => f.sha));
  return newFiles.some((f) => !currentShas.has(f.sha));
}

export async function checkForUpdate(
  forceCheck = false,
): Promise<UpdateInfo | null> {
  const currentVersion = getCurrentVersion();
  const lastCheckStr = await getSetting("update_last_check");
  const lastCheck = lastCheckStr ? Number.parseInt(lastCheckStr, 10) : null;

  if (!forceCheck && lastCheck && Date.now() - lastCheck < CHECK_INTERVAL_MS) {
    const availableVersion = await getSetting("update_available");
    if (!availableVersion) {
      return {
        currentVersion,
        availableVersion: null,
        releaseNotes: null,
        publishedAt: null,
        hasMigrations: false,
        htmlUrl: null,
        lastCheck,
      };
    }

    return {
      currentVersion,
      availableVersion,
      releaseNotes: await getSetting("update_release_notes"),
      publishedAt: await getSetting("update_published_at"),
      hasMigrations: (await getSetting("update_has_migrations")) === "true",
      htmlUrl: await getSetting("update_html_url"),
      lastCheck,
    };
  }

  const release = await fetchLatestRelease();
  const now = Date.now();

  await setSetting("update_last_check", now.toString());

  if (!release) {
    await setSetting("update_available", "");
    return {
      currentVersion,
      availableVersion: null,
      releaseNotes: null,
      publishedAt: null,
      hasMigrations: false,
      htmlUrl: null,
      lastCheck: now,
    };
  }

  const latestVersion = release.tag_name.replace(/^v/, "");

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    await setSetting("update_available", "");
    return {
      currentVersion,
      availableVersion: null,
      releaseNotes: null,
      publishedAt: null,
      hasMigrations: false,
      htmlUrl: null,
      lastCheck: now,
    };
  }

  const hasMigrations = await detectMigrations(currentVersion, latestVersion);

  await setSetting("update_available", latestVersion);
  await setSetting("update_release_notes", release.body || "");
  await setSetting("update_published_at", release.published_at);
  await setSetting("update_has_migrations", hasMigrations.toString());
  await setSetting("update_html_url", release.html_url);

  return {
    currentVersion,
    availableVersion: latestVersion,
    releaseNotes: release.body,
    publishedAt: release.published_at,
    hasMigrations,
    htmlUrl: release.html_url,
    lastCheck: now,
  };
}

export async function getUpdateStatus(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  const lastCheckStr = await getSetting("update_last_check");
  const lastCheck = lastCheckStr ? Number.parseInt(lastCheckStr, 10) : null;
  const availableVersion = await getSetting("update_available");

  if (
    !availableVersion ||
    compareVersions(currentVersion, availableVersion) >= 0
  ) {
    if (availableVersion) {
      await setSetting("update_available", "");
    }
    return {
      currentVersion,
      availableVersion: null,
      releaseNotes: null,
      publishedAt: null,
      hasMigrations: false,
      htmlUrl: null,
      lastCheck,
    };
  }

  return {
    currentVersion,
    availableVersion,
    releaseNotes: await getSetting("update_release_notes"),
    publishedAt: await getSetting("update_published_at"),
    hasMigrations: (await getSetting("update_has_migrations")) === "true",
    htmlUrl: await getSetting("update_html_url"),
    lastCheck,
  };
}

export async function applyUpdate(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (process.env.NODE_ENV !== "production") {
    return { success: false, error: "Updates only available in production" };
  }

  const availableVersion = await getSetting("update_available");
  if (!availableVersion) {
    return { success: false, error: "No update available" };
  }

  try {
    writeFileSync(UPDATE_MARKER_PATH, availableVersion);
    execAsync("systemctl restart frost").catch(() => {});
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to apply update",
    };
  }
}

export function isUpdateMarkerPresent(): boolean {
  return existsSync(UPDATE_MARKER_PATH);
}

export interface UpdateResult {
  completed: boolean;
  success: boolean;
  newVersion: string | null;
  log: string | null;
}

export function getUpdateResult(): UpdateResult {
  if (!existsSync(UPDATE_RESULT_PATH)) {
    return { completed: false, success: false, newVersion: null, log: null };
  }

  const resultContent = readFileSync(UPDATE_RESULT_PATH, "utf-8").trim();
  const log = existsSync(UPDATE_LOG_PATH)
    ? readFileSync(UPDATE_LOG_PATH, "utf-8")
    : null;

  if (resultContent === "failed") {
    return { completed: true, success: false, newVersion: null, log };
  }

  if (resultContent.startsWith("success:")) {
    const newVersion = resultContent.replace("success:", "");
    return { completed: true, success: true, newVersion, log };
  }

  return { completed: false, success: false, newVersion: null, log: null };
}

export function clearUpdateResult(): void {
  if (existsSync(UPDATE_RESULT_PATH)) {
    unlinkSync(UPDATE_RESULT_PATH);
  }
  if (existsSync(UPDATE_LOG_PATH)) {
    unlinkSync(UPDATE_LOG_PATH);
  }
}

export async function persistUpdateResult(): Promise<void> {
  const result = getUpdateResult();
  if (!result.completed) {
    return;
  }

  await setSetting("update_result_success", result.success ? "true" : "false");
  await setSetting("update_result_version", result.newVersion || "");
  await setSetting("update_result_log", result.log || "");
  await setSetting("update_result_at", Date.now().toString());

  clearUpdateResult();
}

export async function getPersistedUpdateResult(): Promise<UpdateResult | null> {
  const resultAt = await getSetting("update_result_at");
  if (!resultAt) {
    return null;
  }

  const success = (await getSetting("update_result_success")) === "true";
  const newVersion = await getSetting("update_result_version");
  const log = await getSetting("update_result_log");

  return {
    completed: true,
    success,
    newVersion: newVersion || null,
    log: log || null,
  };
}

export async function clearPersistedUpdateResult(): Promise<void> {
  await setSetting("update_result_success", "");
  await setSetting("update_result_version", "");
  await setSetting("update_result_log", "");
  await setSetting("update_result_at", "");
}
