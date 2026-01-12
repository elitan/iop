"use client";

import {
  Building2,
  CheckCircle2,
  Github,
  Loader2,
  Plus,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";

interface GitHubInstallation {
  id: string;
  accountLogin: string;
  accountType: string;
}

interface GitHubStatus {
  hasDomain: boolean;
  domain: string | null;
  connected: boolean;
  installed: boolean;
  appName: string | null;
  appSlug: string | null;
  installations: GitHubInstallation[];
}

export function GitHubSection() {
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [manifest, setManifest] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  const successParam = searchParams.get("success");
  const errorParam = searchParams.get("error");

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/settings/github");
        const data = await res.json();
        setStatus(data);

        if (data.hasDomain && !data.connected) {
          const manifestRes = await fetch("/api/settings/github/manifest");
          const manifestData = await manifestRes.json();
          if (manifestData.manifest) {
            setManifest(JSON.stringify(manifestData.manifest));
          }
        }
      } catch {
        setError("Failed to load GitHub status");
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect GitHub? You'll need to set up a new GitHub App to reconnect.",
      )
    ) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch("/api/settings/github/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disconnect");
      }
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              connected: false,
              installed: false,
              appName: null,
              appSlug: null,
            }
          : null,
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  function handleConnect() {
    formRef.current?.submit();
  }

  if (loading) {
    return (
      <SettingCard
        title="GitHub"
        description="Connect GitHub to deploy from private repositories."
      >
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </SettingCard>
    );
  }

  return (
    <SettingCard
      title="GitHub"
      description="Connect GitHub to deploy from private repositories."
      learnMoreUrl="https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps"
      learnMoreText="Learn about GitHub Apps"
      footer={
        status?.connected && status?.installed ? (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Disconnecting...
              </>
            ) : (
              "Disconnect"
            )}
          </Button>
        ) : status?.hasDomain && !status?.connected ? (
          <Button onClick={handleConnect}>
            <Github className="mr-1.5 h-4 w-4" />
            Connect GitHub
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        {successParam === "true" && (
          <div className="flex items-center gap-2 rounded-md bg-green-900/20 p-3 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            GitHub connected successfully!
          </div>
        )}

        {errorParam && (
          <div className="flex items-center gap-2 rounded-md bg-red-900/20 p-3 text-red-400">
            <XCircle className="h-5 w-5" />
            {decodeURIComponent(errorParam)}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-red-900/20 p-3 text-red-400">
            <XCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {!status?.hasDomain && (
          <div className="rounded-md bg-yellow-900/20 p-4 text-yellow-400">
            <p className="font-medium">Domain required</p>
            <p className="mt-1 text-sm text-yellow-500">
              Configure a domain with SSL before connecting GitHub. Webhooks
              require a publicly accessible URL.
            </p>
            <Link
              href="/settings/domain"
              className="mt-3 inline-block text-sm underline hover:text-yellow-300"
            >
              Configure domain →
            </Link>
          </div>
        )}

        {status?.hasDomain && !status?.connected && (
          <>
            <p className="text-sm text-neutral-400">
              Click "Connect GitHub" to create a GitHub App for your Frost
              instance. You'll be redirected to GitHub to complete the setup.
            </p>
            <form
              ref={formRef}
              action="https://github.com/settings/apps/new"
              method="POST"
              className="hidden"
            >
              <input type="hidden" name="manifest" value={manifest} />
            </form>
          </>
        )}

        {status?.connected && !status?.installed && (
          <div className="rounded-md bg-blue-900/20 p-4 text-blue-400">
            <p className="font-medium">Installation required</p>
            <p className="mt-1 text-sm text-blue-300">
              Your GitHub App "{status.appName}" was created. Install it on your
              repositories to enable deployments.
            </p>
            <a
              href={`https://github.com/apps/${status.appSlug}/installations/new`}
              className="mt-3 inline-block text-sm underline hover:text-blue-200"
            >
              Install on repositories →
            </a>
          </div>
        )}

        {status?.connected && status?.installed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Connected via "{status.appName}"</span>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-500 uppercase">
                Installations
              </p>
              {status.installations.map((installation) => (
                <div
                  key={installation.id}
                  className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {installation.accountType === "Organization" ? (
                      <Building2 className="h-4 w-4 text-neutral-400" />
                    ) : (
                      <User className="h-4 w-4 text-neutral-400" />
                    )}
                    <span className="text-sm text-neutral-200">
                      {installation.accountLogin}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {installation.accountType}
                    </span>
                  </div>
                </div>
              ))}
              {status.installations.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No installations found. Click below to install.
                </p>
              )}
            </div>
            <a
              href={`https://github.com/apps/${status.appSlug}/installations/new`}
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another account or organization
            </a>
          </div>
        )}
      </div>
    </SettingCard>
  );
}
