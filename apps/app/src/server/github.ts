import { basename, dirname, resolve } from "node:path";
import type { FrostConfig } from "@/lib/frost-config";
import { parseFrostConfig } from "@/lib/frost-config";
import {
  deriveServiceName,
  fetchFileContent,
  fetchRepoTree,
  findDockerfiles,
  findFrostFiles,
  hasGitHubApp,
  listInstallationRepos,
  parseDockerfilePort,
  readLocalFile,
  scanLocalDirectory,
} from "@/lib/github";
import { getDataDir } from "@/lib/paths";
import { os } from "./orpc";

const MOCK_DATA = {
  owners: [
    {
      login: "elitan",
      avatar_url: "https://github.com/elitan.png",
      type: "User" as const,
    },
    {
      login: "nhost",
      avatar_url: "https://github.com/nhost.png",
      type: "Organization" as const,
    },
  ],
  repos: [
    {
      id: 1,
      name: "frost",
      full_name: "elitan/frost",
      private: false,
      default_branch: "main",
      pushed_at: new Date().toISOString(),
      owner: { login: "elitan", avatar_url: "https://github.com/elitan.png" },
    },
    {
      id: 2,
      name: "my-app",
      full_name: "elitan/my-app",
      private: true,
      default_branch: "main",
      pushed_at: new Date(Date.now() - 3600000).toISOString(),
      owner: { login: "elitan", avatar_url: "https://github.com/elitan.png" },
    },
    {
      id: 3,
      name: "api-server",
      full_name: "elitan/api-server",
      private: true,
      default_branch: "develop",
      pushed_at: new Date(Date.now() - 86400000).toISOString(),
      owner: { login: "elitan", avatar_url: "https://github.com/elitan.png" },
    },
    {
      id: 4,
      name: "nhost",
      full_name: "nhost/nhost",
      private: false,
      default_branch: "main",
      pushed_at: new Date(Date.now() - 7200000).toISOString(),
      owner: { login: "nhost", avatar_url: "https://github.com/nhost.png" },
    },
    {
      id: 5,
      name: "hasura-backend-plus",
      full_name: "nhost/hasura-backend-plus",
      private: false,
      default_branch: "master",
      pushed_at: new Date(Date.now() - 172800000).toISOString(),
      owner: { login: "nhost", avatar_url: "https://github.com/nhost.png" },
    },
  ],
};

const MOCK_SCAN_RESULTS: Record<
  string,
  { path: string; port: number | null }[]
> = {
  "simple-node": [{ path: "Dockerfile", port: 3000 }],
  "monorepo-example": [
    { path: "apps/api/Dockerfile", port: 4000 },
    { path: "apps/web/Dockerfile", port: 3000 },
    { path: "Dockerfile", port: 8080 },
  ],
  frost: [{ path: "Dockerfile", port: 3000 }],
  "my-app": [{ path: "Dockerfile", port: 3000 }],
  "api-server": [
    { path: "apps/api/Dockerfile", port: 4000 },
    { path: "packages/worker/Dockerfile", port: null },
  ],
  nhost: [
    { path: "apps/dashboard/Dockerfile", port: 3000 },
    { path: "apps/hasura/Dockerfile", port: 8080 },
  ],
  "hasura-backend-plus": [{ path: "Dockerfile", port: 3000 }],
};

export const github = {
  repos: os.github.repos.handler(async ({ input }) => {
    const connected = await hasGitHubApp();
    const useMock =
      input?.mock === true || process.env.NODE_ENV === "development";

    if (!connected) {
      if (useMock) {
        return MOCK_DATA;
      }
      throw new Error("GitHub App not connected");
    }

    const { owners, repos } = await listInstallationRepos();
    return { owners, repos };
  }),

  scan: os.github.scan.handler(async ({ input }) => {
    const { repoUrl, branch, repoName } = input;

    interface FrostConfigInfo {
      frostFilePath: string;
      healthCheckPath?: string;
      healthCheckTimeout?: number;
      memoryLimit?: string;
      cpuLimit?: number;
    }

    interface DockerfileInfo {
      path: string;
      suggestedName: string;
      buildContext: string;
      detectedPort: number | null;
      frostConfig?: FrostConfigInfo;
    }

    function extractFrostConfigInfo(
      frostFilePath: string,
      config: FrostConfig,
    ): FrostConfigInfo {
      const info: FrostConfigInfo = { frostFilePath };
      if (config.health_check?.path)
        info.healthCheckPath = config.health_check.path;
      if (config.health_check?.timeout)
        info.healthCheckTimeout = config.health_check.timeout;
      if (config.resources?.memory) info.memoryLimit = config.resources.memory;
      if (config.resources?.cpu) info.cpuLimit = config.resources.cpu;
      return info;
    }

    async function buildDockerfileInfo(
      dockerfilePaths: string[],
      frostFilePaths: string[],
      readFile: (path: string) => Promise<string>,
    ): Promise<DockerfileInfo[]> {
      const frostByDir = new Map<string, string[]>();
      for (const frostPath of frostFilePaths) {
        const dir = dirname(frostPath);
        const existing = frostByDir.get(dir) ?? [];
        existing.push(frostPath);
        frostByDir.set(dir, existing);
      }

      for (const [dir, files] of frostByDir) {
        if (files.length > 1) {
          throw new Error(
            `Multiple frost config files found in ${dir === "." ? "root" : dir}: ${files.map((f) => basename(f)).join(", ")}`,
          );
        }
      }

      const dockerfileByDir = new Map<string, string>();
      for (const path of dockerfilePaths) {
        const dir = dirname(path);
        if (!dockerfileByDir.has(dir)) {
          dockerfileByDir.set(dir, path);
        }
      }

      const results: DockerfileInfo[] = [];
      const processedDirs = new Set<string>();

      for (const [dir, frostPaths] of frostByDir) {
        const frostPath = frostPaths[0];
        let config: FrostConfig | null = null;
        try {
          const content = await readFile(frostPath);
          config = parseFrostConfig(content);
        } catch {}

        let dockerfilePath = dockerfileByDir.get(dir);
        if (config?.dockerfile) {
          const customPath =
            dir === "." ? config.dockerfile : `${dir}/${config.dockerfile}`;
          dockerfilePath = customPath;
        }

        if (!dockerfilePath) continue;

        let detectedPort: number | null = config?.port ?? null;
        if (detectedPort === null) {
          try {
            const content = await readFile(dockerfilePath);
            detectedPort = parseDockerfilePort(content);
          } catch {}
        }

        results.push({
          path: dockerfilePath,
          suggestedName: deriveServiceName(dockerfilePath, repoName),
          buildContext: ".",
          detectedPort,
          frostConfig: config
            ? extractFrostConfigInfo(frostPath, config)
            : undefined,
        });
        processedDirs.add(dir);
      }

      for (const dockerfilePath of dockerfilePaths) {
        const dir = dirname(dockerfilePath);
        if (processedDirs.has(dir)) continue;

        let detectedPort: number | null = null;
        try {
          const content = await readFile(dockerfilePath);
          detectedPort = parseDockerfilePort(content);
        } catch {}

        results.push({
          path: dockerfilePath,
          suggestedName: deriveServiceName(dockerfilePath, repoName),
          buildContext: ".",
          detectedPort,
        });
      }

      return results;
    }

    if (repoUrl.startsWith("./") || repoUrl.startsWith("/")) {
      const basePath = repoUrl.startsWith("./")
        ? resolve(getDataDir(), "..", repoUrl)
        : repoUrl;
      const { dockerfiles: dockerfilePaths, frostFiles } =
        await scanLocalDirectory(basePath);
      const dockerfiles = await buildDockerfileInfo(
        dockerfilePaths,
        frostFiles,
        (p) => readLocalFile(basePath, p),
      );
      return { dockerfiles };
    }

    const connected = await hasGitHubApp();

    if (!connected) {
      const mockData = MOCK_SCAN_RESULTS[repoName] ?? [
        { path: "Dockerfile", port: 8080 },
      ];
      return {
        dockerfiles: mockData.map((m) => ({
          path: m.path,
          suggestedName: deriveServiceName(m.path, repoName),
          buildContext: ".",
          detectedPort: m.port,
        })),
      };
    }

    const tree = await fetchRepoTree(repoUrl, branch);
    const dockerfilePaths = findDockerfiles(tree);
    const frostFilePaths = findFrostFiles(tree);
    const dockerfiles = await buildDockerfileInfo(
      dockerfilePaths,
      frostFilePaths,
      (p) => fetchFileContent(repoUrl, branch, p),
    );
    return { dockerfiles };
  }),
};
