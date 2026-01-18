import { NextResponse } from "next/server";
import { hasGitHubApp, listInstallationRepos } from "@/lib/github";

const MOCK_DATA = {
  owners: [
    { login: "elitan", avatar_url: "https://github.com/elitan.png", type: "User" as const },
    { login: "nhost", avatar_url: "https://github.com/nhost.png", type: "Organization" as const },
  ],
  repos: [
    { id: 1, name: "frost", full_name: "elitan/frost", private: false, default_branch: "main", pushed_at: new Date().toISOString(), owner: { login: "elitan", avatar_url: "https://github.com/elitan.png" } },
    { id: 2, name: "my-app", full_name: "elitan/my-app", private: true, default_branch: "main", pushed_at: new Date(Date.now() - 3600000).toISOString(), owner: { login: "elitan", avatar_url: "https://github.com/elitan.png" } },
    { id: 3, name: "api-server", full_name: "elitan/api-server", private: true, default_branch: "develop", pushed_at: new Date(Date.now() - 86400000).toISOString(), owner: { login: "elitan", avatar_url: "https://github.com/elitan.png" } },
    { id: 4, name: "nhost", full_name: "nhost/nhost", private: false, default_branch: "main", pushed_at: new Date(Date.now() - 7200000).toISOString(), owner: { login: "nhost", avatar_url: "https://github.com/nhost.png" } },
    { id: 5, name: "hasura-backend-plus", full_name: "nhost/hasura-backend-plus", private: false, default_branch: "master", pushed_at: new Date(Date.now() - 172800000).toISOString(), owner: { login: "nhost", avatar_url: "https://github.com/nhost.png" } },
  ],
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const useMock = url.searchParams.get("mock") === "true" || process.env.NODE_ENV === "development";

  if (useMock) {
    const connected = await hasGitHubApp();
    if (!connected) {
      return NextResponse.json(MOCK_DATA);
    }
  }

  const connected = await hasGitHubApp();
  if (!connected) {
    return NextResponse.json(
      { error: "GitHub App not connected" },
      { status: 400 },
    );
  }

  try {
    const { owners, repos } = await listInstallationRepos();
    return NextResponse.json({ owners, repos });
  } catch (err: any) {
    console.error("Failed to list GitHub repos:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
