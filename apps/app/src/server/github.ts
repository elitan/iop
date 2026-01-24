import { resolve } from "node:path";
import {
  deriveServiceName,
  fetchFileContent,
  fetchRepoTree,
  findDockerfiles,
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

    async function buildDockerfileInfo(
      paths: string[],
      readFile: (path: string) => Promise<string>,
    ) {
      return Promise.all(
        paths.map(async (path) => {
          let detectedPort: number | null = null;
          try {
            const content = await readFile(path);
            detectedPort = parseDockerfilePort(content);
          } catch {}
          return {
            path,
            suggestedName: deriveServiceName(path, repoName),
            buildContext: ".",
            detectedPort,
          };
        }),
      );
    }

    if (repoUrl.startsWith("./") || repoUrl.startsWith("/")) {
      const basePath = repoUrl.startsWith("./")
        ? resolve(getDataDir(), "..", repoUrl)
        : repoUrl;
      const paths = await scanLocalDirectory(basePath);
      const dockerfiles = await buildDockerfileInfo(paths, (p) =>
        readLocalFile(basePath, p),
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
    const paths = findDockerfiles(tree);
    const dockerfiles = await buildDockerfileInfo(paths, (p) =>
      fetchFileContent(repoUrl, branch, p),
    );
    return { dockerfiles };
  }),
};
