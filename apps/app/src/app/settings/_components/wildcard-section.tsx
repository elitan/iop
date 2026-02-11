"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { orpc } from "@/lib/orpc-client";

export function WildcardSection() {
  const demoMode = useDemoMode();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const { data: config } = useQuery(orpc.settings.wildcard.get.queryOptions());
  const { data: settings } = useQuery(orpc.settings.get.queryOptions());

  useEffect(() => {
    if (config?.wildcardDomain) {
      setDomain(config.wildcardDomain);
    }
  }, [config]);

  const testMutation = useMutation(
    orpc.settings.wildcard.test.mutationOptions({
      onSuccess: (data) => {
        setTokenValid(data.valid);
        if (!data.valid && data.error) {
          setError(data.error);
        }
      },
      onError: () => {
        setError("Failed to verify token");
      },
    }),
  );

  const saveMutation = useMutation(
    orpc.settings.wildcard.set.mutationOptions({
      onSuccess: async (data) => {
        if (data.dnsWarning) {
          toast.warning("DNS record not created", {
            description: data.dnsWarning,
            duration: 10000,
          });
        }
        if (data.caddyWarning) {
          toast.warning("Caddy config sync failed", {
            description: data.caddyWarning,
            duration: 10000,
          });
        }
        setSuccess(true);
        setApiToken("");
        await queryClient.refetchQueries({
          queryKey: orpc.settings.wildcard.get.key(),
        });
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : "Failed to save settings",
        );
      },
    }),
  );

  const removeMutation = useMutation(
    orpc.settings.wildcard.delete.mutationOptions({
      onSuccess: async (data) => {
        if (data.caddyWarning) {
          toast.warning("Caddy config sync failed", {
            description: data.caddyWarning,
            duration: 10000,
          });
        }
        setDomain("");
        setApiToken("");
        setTokenValid(null);
        await queryClient.refetchQueries({
          queryKey: orpc.settings.wildcard.get.key(),
        });
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : "Failed to remove settings",
        );
      },
    }),
  );

  async function handleTestToken() {
    if (demoMode) return;
    if (!apiToken) return;
    setError("");
    setTokenValid(null);
    testMutation.mutate({ dnsProvider: "cloudflare", dnsApiToken: apiToken });
  }

  async function handleSave() {
    if (demoMode) return;
    if (!domain || !apiToken) return;
    setError("");
    setSuccess(false);
    saveMutation.mutate({
      wildcardDomain: domain,
      dnsProvider: "cloudflare",
      dnsApiToken: apiToken,
    });
  }

  async function handleRemove() {
    if (demoMode) return;
    setError("");
    removeMutation.mutate({});
  }

  const testing = testMutation.isPending;
  const saving = saveMutation.isPending || removeMutation.isPending;

  return (
    <SettingCard
      title="Wildcard Domain"
      description="Auto-generate subdomains for services with wildcard SSL. Requires DNS provider API access for certificate verification."
      learnMoreUrl="https://caddyserver.com/docs/automatic-https#dns-challenge"
      learnMoreText="Learn more about DNS-01 challenge"
      footer={
        config?.configured ? (
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={demoMode || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={demoMode || !domain || !apiToken || saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {demoMode && (
          <DemoModeAlert text="Wildcard settings are locked in demo mode." />
        )}

        {config?.configured && config.wildcardDomain && (
          <div className="flex items-center gap-2 rounded-md bg-green-900/20 p-3 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>
              Wildcard configured for <strong>*.{config.wildcardDomain}</strong>
            </span>
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-900/20 p-3 text-green-400">
            Wildcard domain configured successfully! New services will
            automatically get subdomains.
          </div>
        )}

        {settings?.serverIp && (
          <div className="flex items-center gap-2 rounded-md bg-neutral-800/50 p-3">
            <span className="text-sm text-neutral-400">Your server IP:</span>
            <code className="text-sm font-mono text-neutral-200">
              {settings.serverIp}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                navigator.clipboard.writeText(settings.serverIp);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="wildcard-domain" className="text-sm text-neutral-400">
            Wildcard Domain
          </Label>
          <Input
            id="wildcard-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value.replace(/^\*\./, ""))}
            placeholder="apps.example.com"
            disabled={demoMode || Boolean(config?.configured)}
            className="h-10 border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600 focus-visible:ring-neutral-700"
          />
          <p className="text-xs text-neutral-500">
            Services get subdomains like: api-myproject.
            {domain || "apps.example.com"}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="dns-provider" className="text-sm text-neutral-400">
            DNS Provider
          </Label>
          <Input
            id="dns-provider"
            value="Cloudflare"
            disabled
            className="h-10 border-neutral-800 bg-neutral-800 text-neutral-400"
          />
          <p className="text-xs text-neutral-500">More providers coming soon</p>
        </div>

        {!config?.configured && (
          <div className="grid gap-2">
            <Label htmlFor="api-token" className="text-sm text-neutral-400">
              Cloudflare API Token
            </Label>
            <div className="flex gap-2">
              <Input
                id="api-token"
                type="password"
                value={apiToken}
                onChange={(e) => {
                  setApiToken(e.target.value);
                  setTokenValid(null);
                }}
                disabled={demoMode}
                placeholder="Enter your Cloudflare API token"
                className="h-10 border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600 focus-visible:ring-neutral-700"
              />
              <Button
                variant="secondary"
                onClick={handleTestToken}
                disabled={demoMode || !apiToken || testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Test"
                )}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="mt-1 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              {showInstructions ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              How to create a Cloudflare token
            </button>

            {showInstructions && (
              <div className="mt-2 rounded-md bg-neutral-800/50 p-3 text-xs text-neutral-400">
                <ol className="list-inside list-decimal space-y-1">
                  <li>
                    Go to{" "}
                    <a
                      href="https://dash.cloudflare.com/profile/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Cloudflare API Tokens
                    </a>
                  </li>
                  <li>
                    Click{" "}
                    <strong className="text-neutral-300">Create Token</strong>
                  </li>
                  <li>
                    Find{" "}
                    <strong className="text-neutral-300">Edit zone DNS</strong>{" "}
                    → Use template
                  </li>
                  <li>Zone Resources → select your domain</li>
                  <li>Create Token → copy it</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {tokenValid !== null && (
          <div
            className={`flex items-center gap-2 rounded-md p-3 ${
              tokenValid
                ? "bg-green-900/20 text-green-400"
                : "bg-red-900/20 text-red-400"
            }`}
          >
            {tokenValid ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>API token is valid</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                <span>Invalid or inactive API token</span>
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </SettingCard>
  );
}
