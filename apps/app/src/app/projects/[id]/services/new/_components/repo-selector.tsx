"use client";

import { ChevronDown, Github, Loader2, Lock, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Owner {
  login: string;
  avatar_url: string;
  type: "User" | "Organization";
}

interface Repo {
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

interface RepoSelectorProps {
  onSelect: (repo: {
    url: string;
    branch: string;
    name: string;
    ownerAvatar: string;
  }) => void;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RepoSelector({ onSelect }: RepoSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [owners, setOwners] = useState<Owner[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await fetch("/api/github/repos");
        if (!res.ok) {
          const data = await res.json();
          if (res.status === 400 && data.error === "GitHub App not connected") {
            setConnected(false);
            return;
          }
          throw new Error(data.error || "Failed to fetch repos");
        }

        setConnected(true);
        const data = await res.json();
        setOwners(data.owners);
        setRepos(data.repos);
        if (data.owners.length > 0) {
          setSelectedOwner(data.owners[0].login);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchRepos();
  }, []);

  const filteredRepos = useMemo(() => {
    return repos
      .filter((repo) => {
        if (selectedOwner && repo.owner.login !== selectedOwner) return false;
        if (search && !repo.name.toLowerCase().includes(search.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime(),
      );
  }, [repos, selectedOwner, search]);

  const selectedOwnerData = owners.find((o) => o.login === selectedOwner);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-neutral-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading repositories...
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center">
        <Github className="mx-auto h-8 w-8 text-neutral-500" />
        <p className="mt-3 text-sm text-neutral-400">
          Connect GitHub to import from your repositories
        </p>
        <Link href="/settings/github">
          <Button size="sm" className="mt-4">
            Connect GitHub
          </Button>
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-900/20 p-4 text-center text-red-400">
        <p>{error}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowOwnerDropdown(!showOwnerDropdown)}
            className="flex h-10 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm text-neutral-100 hover:bg-neutral-700"
          >
            {selectedOwnerData?.avatar_url ? (
              <img
                src={selectedOwnerData.avatar_url}
                alt={selectedOwnerData.login}
                className="h-5 w-5 rounded-full"
              />
            ) : (
              <Github className="h-4 w-4" />
            )}
            <span>{selectedOwnerData?.login || "Select"}</span>
            <ChevronDown className="h-4 w-4 text-neutral-500" />
          </button>
          {showOwnerDropdown && (
            <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
              {owners.map((owner) => (
                <button
                  key={owner.login}
                  type="button"
                  onClick={() => {
                    setSelectedOwner(owner.login);
                    setShowOwnerDropdown(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-700 ${
                    selectedOwner === owner.login
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-300"
                  }`}
                >
                  <img
                    src={owner.avatar_url}
                    alt={owner.login}
                    className="h-5 w-5 rounded-full"
                  />
                  <span>{owner.login}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 border-neutral-700 bg-neutral-800 pl-9 text-neutral-100 placeholder:text-neutral-500"
          />
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-700">
        {filteredRepos.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-500">
            {search ? "No repos found" : "No repositories available"}
          </div>
        ) : (
          filteredRepos.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 last:border-b-0 hover:bg-neutral-800/50"
            >
              <div className="flex items-center gap-3">
                <img
                  src={repo.owner.avatar_url}
                  alt={repo.owner.login}
                  className="h-6 w-6 rounded-full"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-100">
                      {repo.name}
                    </span>
                    {repo.private && (
                      <Lock className="h-3 w-3 text-neutral-500" />
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {formatTimeAgo(repo.pushed_at)}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onSelect({
                    url: `https://github.com/${repo.full_name}`,
                    branch: repo.default_branch,
                    name: repo.name,
                    ownerAvatar: repo.owner.avatar_url,
                  })
                }
              >
                Import
              </Button>
            </div>
          ))
        )}
      </div>

      {repos.length > 0 && (
        <p className="text-xs text-neutral-500">
          Don't see your repo?{" "}
          <a
            href={`https://github.com/settings/installations`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Manage repository access
          </a>
        </p>
      )}
    </div>
  );
}
