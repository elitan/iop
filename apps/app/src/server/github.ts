import { hasGitHubApp, listInstallationRepos } from "@/lib/github";
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
};
