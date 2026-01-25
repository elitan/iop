import { createPrivateKey, createSign, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getSetting, setSetting } from "./auth";
import { db } from "./db";

const GITHUB_API = "https://api.github.com";

function parseLinkHeader(header: string | null): { next?: string } {
  if (!header) return {};
  const links: { next?: string } = {};
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === "next") {
      links.next = match[1];
    }
  }
  return links;
}

export interface GitHubInstallation {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: string;
  createdAt: number;
}

export interface GitHubAppCredentials {
  appId: string;
  slug: string;
  name: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
  installationId: string | null;
}

export async function getGitHubAppCredentials(): Promise<GitHubAppCredentials | null> {
  const appId = await getSetting("github_app_id");
  if (!appId) return null;

  const slug = await getSetting("github_app_slug");
  const name = await getSetting("github_app_name");
  const privateKey = await getSetting("github_app_private_key");
  const webhookSecret = await getSetting("github_app_webhook_secret");
  const clientId = await getSetting("github_app_client_id");
  const clientSecret = await getSetting("github_app_client_secret");
  const installationId = await getSetting("github_app_installation_id");

  if (
    !slug ||
    !name ||
    !privateKey ||
    !webhookSecret ||
    !clientId ||
    !clientSecret
  ) {
    return null;
  }

  return {
    appId,
    slug,
    name,
    privateKey,
    webhookSecret,
    clientId,
    clientSecret,
    installationId,
  };
}

export async function hasGitHubApp(): Promise<boolean> {
  const creds = await getGitHubAppCredentials();
  if (!creds) return false;
  const installations = await getInstallations();
  return installations.length > 0 || creds.installationId !== null;
}

export async function getInstallations(): Promise<GitHubInstallation[]> {
  return db
    .selectFrom("githubInstallations")
    .selectAll()
    .orderBy("createdAt", "desc")
    .execute();
}

export async function getInstallationByAccount(
  accountLogin: string,
): Promise<GitHubInstallation | null> {
  return (
    (await db
      .selectFrom("githubInstallations")
      .selectAll()
      .where("accountLogin", "=", accountLogin)
      .executeTakeFirst()) ?? null
  );
}

export async function saveInstallation(installation: {
  installationId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
}): Promise<void> {
  const existing = await db
    .selectFrom("githubInstallations")
    .selectAll()
    .where("installationId", "=", installation.installationId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("githubInstallations")
      .set({
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
      })
      .where("installationId", "=", installation.installationId)
      .execute();
  } else {
    await db
      .insertInto("githubInstallations")
      .values({
        id: randomUUID(),
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        createdAt: Date.now(),
      })
      .execute();
  }
}

export async function deleteInstallation(
  installationId: string,
): Promise<void> {
  await db
    .deleteFrom("githubInstallations")
    .where("installationId", "=", installationId)
    .execute();
}

export async function saveGitHubAppCredentials(creds: {
  appId: string;
  slug: string;
  name: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await setSetting("github_app_id", creds.appId);
  await setSetting("github_app_slug", creds.slug);
  await setSetting("github_app_name", creds.name);
  await setSetting("github_app_private_key", creds.privateKey);
  await setSetting("github_app_webhook_secret", creds.webhookSecret);
  await setSetting("github_app_client_id", creds.clientId);
  await setSetting("github_app_client_secret", creds.clientSecret);
}

export async function saveInstallationId(
  installationId: string,
): Promise<void> {
  await setSetting("github_app_installation_id", installationId);
}

export async function clearGitHubAppCredentials(): Promise<void> {
  const keys = [
    "github_app_id",
    "github_app_slug",
    "github_app_name",
    "github_app_private_key",
    "github_app_webhook_secret",
    "github_app_client_id",
    "github_app_client_secret",
    "github_app_installation_id",
  ];
  for (const key of keys) {
    await setSetting(key, "");
  }
  await db.deleteFrom("githubInstallations").execute();
}

export async function fetchInstallationInfo(installationId: string): Promise<{
  accountLogin: string;
  accountType: "User" | "Organization";
}> {
  const creds = await getGitHubAppCredentials();
  if (!creds) {
    throw new Error("GitHub App not configured");
  }

  const jwt = createJWT(creds.appId, creds.privateKey);

  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch installation info: ${error}`);
  }

  const data = await res.json();
  return {
    accountLogin: data.account.login,
    accountType: data.account.type,
  };
}

function createJWT(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const privateKey = createPrivateKey(privateKeyPem);
  const sign = createSign("RSA-SHA256");
  sign.update(`${headerB64}.${payloadB64}`);
  const signature = sign.sign(privateKey, "base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function extractAccountFromRepoUrl(repoUrl: string): string | null {
  const match = repoUrl.match(/(?:github\.com\/|git@github\.com:)([^/]+)\//);
  return match?.[1] ?? null;
}

async function findInstallationId(repoUrl?: string): Promise<string> {
  const installations = await getInstallations();
  const creds = await getGitHubAppCredentials();

  if (repoUrl) {
    const account = extractAccountFromRepoUrl(repoUrl);
    if (account) {
      const installation = installations.find(
        (i) => i.accountLogin.toLowerCase() === account.toLowerCase(),
      );
      if (installation) return installation.installationId;
    }
  }

  if (installations.length > 0) {
    return installations[0].installationId;
  }

  if (creds?.installationId) {
    return creds.installationId;
  }

  throw new Error("No GitHub App installation found for this repository");
}

export async function generateInstallationToken(
  repoUrl?: string,
): Promise<string> {
  const creds = await getGitHubAppCredentials();
  if (!creds) {
    throw new Error("GitHub App not configured");
  }

  const installationId = await findInstallationId(repoUrl);
  const jwt = createJWT(creds.appId, creds.privateKey);

  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to generate installation token: ${error}`);
  }

  const data = await res.json();
  return data.token;
}

export function isGitHubRepo(repoUrl: string): boolean {
  return repoUrl.includes("github.com");
}

export function normalizeGitHubUrl(url: string): string {
  const httpsUrl = url.startsWith("git@github.com:")
    ? url.replace("git@github.com:", "https://github.com/")
    : url;
  return httpsUrl.replace(/\.git$/, "");
}

export function parseOwnerRepoFromUrl(
  repoUrl: string,
): { owner: string; repo: string } | null {
  const normalized = normalizeGitHubUrl(repoUrl);
  const match = normalized.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function createCommitStatus(params: {
  repoUrl: string;
  commitSha: string;
  state: "pending" | "success" | "failure" | "error";
  targetUrl?: string;
  description?: string;
  context?: string;
}): Promise<void> {
  const parsed = parseOwnerRepoFromUrl(params.repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repo URL");
  }

  const token = await generateInstallationToken(params.repoUrl);
  const { owner, repo } = parsed;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/statuses/${params.commitSha}`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: params.state,
        target_url: params.targetUrl,
        description: params.description,
        context: params.context || "frost",
      }),
    },
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create commit status: ${error}`);
  }
}

export function injectTokenIntoUrl(repoUrl: string, token: string): string {
  const authPrefix = `https://x-access-token:${token}@github.com/`;

  if (repoUrl.startsWith("https://github.com/")) {
    return repoUrl.replace("https://github.com/", authPrefix);
  }
  if (repoUrl.startsWith("git@github.com:")) {
    return authPrefix + repoUrl.replace("git@github.com:", "");
  }
  return repoUrl;
}

export function buildManifest(domain: string): object {
  const baseUrl = `https://${domain}`;
  const randomId = Math.random().toString(36).substring(2, 10);
  return {
    name: `Frost-${randomId}`,
    url: baseUrl,
    hook_attributes: {
      url: `${baseUrl}/api/github/webhook`,
      active: true,
    },
    redirect_url: `${baseUrl}/api/github/callback`,
    callback_urls: [`${baseUrl}/api/github/callback`],
    setup_url: `${baseUrl}/api/github/install-callback`,
    public: true,
    default_permissions: {
      contents: "read",
      metadata: "read",
      statuses: "write",
      pull_requests: "write",
    },
    default_events: ["push", "pull_request", "delete"],
  };
}

export async function exchangeCodeForCredentials(code: string): Promise<{
  id: number;
  slug: string;
  name: string;
  pem: string;
  webhook_secret: string;
  client_id: string;
  client_secret: string;
}> {
  const res = await fetch(`${GITHUB_API}/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return res.json();
}

export interface GitHubOwner {
  login: string;
  avatar_url: string;
  type: "User" | "Organization";
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  pushed_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export async function listInstallationRepos(): Promise<{
  owners: GitHubOwner[];
  repos: GitHubRepo[];
}> {
  const token = await generateInstallationToken();
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const allRawRepos: any[] = [];
  let url: string | null =
    `${GITHUB_API}/installation/repositories?per_page=100`;

  while (url) {
    const res: Response = await fetch(url, { headers });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to list repos: ${error}`);
    }
    const data = await res.json();
    allRawRepos.push(...data.repositories);
    url = parseLinkHeader(res.headers.get("Link")).next ?? null;
  }

  const repos: GitHubRepo[] = allRawRepos.map((repo: any) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    default_branch: repo.default_branch,
    pushed_at: repo.pushed_at,
    owner: {
      login: repo.owner.login,
      avatar_url: repo.owner.avatar_url,
    },
  }));

  const ownerMap = new Map<string, GitHubOwner>();
  for (const repo of allRawRepos) {
    if (!ownerMap.has(repo.owner.login)) {
      ownerMap.set(repo.owner.login, {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
        type: repo.owner.type === "Organization" ? "Organization" : "User",
      });
    }
  }

  return {
    owners: Array.from(ownerMap.values()),
    repos,
  };
}

export async function createPRComment(
  repoUrl: string,
  prNumber: number,
  body: string,
): Promise<number> {
  const parsed = parseOwnerRepoFromUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repo URL");
  }

  const token = await generateInstallationToken(repoUrl);
  const { owner, repo } = parsed;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create PR comment: ${error}`);
  }

  const data = await res.json();
  return data.id;
}

export async function updatePRComment(
  repoUrl: string,
  commentId: number,
  body: string,
): Promise<void> {
  const parsed = parseOwnerRepoFromUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repo URL");
  }

  const token = await generateInstallationToken(repoUrl);
  const { owner, repo } = parsed;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update PR comment: ${error}`);
  }
}

export interface GitHubPullRequest {
  number: number;
  state: "open" | "closed";
  head: {
    ref: string;
    sha: string;
  };
}

export async function findOpenPRsForBranch(
  repoUrl: string,
  branch: string,
): Promise<GitHubPullRequest[]> {
  const parsed = parseOwnerRepoFromUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repo URL");
  }

  const token = await generateInstallationToken(repoUrl);
  const { owner, repo } = parsed;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${branch}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to find PRs for branch: ${error}`);
  }

  const data = await res.json();
  return data.map((pr: any) => ({
    number: pr.number,
    state: pr.state,
    head: {
      ref: pr.head.ref,
      sha: pr.head.sha,
    },
  }));
}

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export async function fetchRepoTree(
  repoUrl: string,
  branch: string,
): Promise<GitHubTreeEntry[]> {
  const parsed = parseOwnerRepoFromUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repo URL");
  }

  const token = await generateInstallationToken(repoUrl);
  const { owner, repo } = parsed;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch repo tree: ${error}`);
  }

  const data = await res.json();
  return data.tree.map((entry: any) => ({
    path: entry.path,
    type: entry.type,
    sha: entry.sha,
  }));
}

export function findDockerfiles(tree: GitHubTreeEntry[]): string[] {
  return tree
    .filter((entry) => {
      if (entry.type !== "blob") return false;
      const name = basename(entry.path);
      return name === "Dockerfile" || name.startsWith("Dockerfile.");
    })
    .map((entry) => entry.path);
}

export function deriveServiceName(
  dockerfilePath: string,
  repoName: string,
): string {
  const dir = dirname(dockerfilePath);
  const file = basename(dockerfilePath);

  if (file.startsWith("Dockerfile.")) {
    return file.replace("Dockerfile.", "");
  }

  if (dir === ".") {
    return repoName;
  }

  const parts = dir.split("/");
  return parts[parts.length - 1];
}

export async function scanLocalDirectory(basePath: string): Promise<string[]> {
  const dockerfiles: string[] = [];

  async function scan(
    currentPath: string,
    relativePath: string,
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = join(currentPath, entry.name);
      const relPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        await scan(fullPath, relPath);
      } else if (
        entry.name === "Dockerfile" ||
        entry.name.startsWith("Dockerfile.")
      ) {
        dockerfiles.push(relPath);
      }
    }
  }

  await scan(basePath, "");
  return dockerfiles;
}

export async function readLocalFile(
  basePath: string,
  filePath: string,
): Promise<string> {
  const fullPath = join(basePath, filePath);
  return readFile(fullPath, "utf-8");
}

export async function fetchFileContent(
  repoUrl: string,
  branch: string,
  filePath: string,
): Promise<string> {
  const parsed = parseOwnerRepoFromUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repo URL");
  }

  const token = await generateInstallationToken(repoUrl);
  const { owner, repo } = parsed;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch file: ${res.statusText}`);
  }

  return res.text();
}

export function parseDockerfilePort(content: string): number | null {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    const exposeMatch = trimmed.match(/^EXPOSE\s+(\d+)/i);
    if (exposeMatch) {
      return parseInt(exposeMatch[1], 10);
    }

    const envPortMatch = trimmed.match(/^ENV\s+PORT[=\s]+(\d+)/i);
    if (envPortMatch) {
      return parseInt(envPortMatch[1], 10);
    }
  }

  return null;
}
