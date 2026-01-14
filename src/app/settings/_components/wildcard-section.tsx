"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WildcardConfig {
  wildcardDomain: string | null;
  dnsProvider: string | null;
  configured: boolean;
  hasToken: boolean;
}

export function WildcardSection() {
  const [domain, setDomain] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [config, setConfig] = useState<WildcardConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings/wildcard")
      .then((res) => res.json())
      .then((data: WildcardConfig) => {
        setConfig(data);
        if (data.wildcardDomain) {
          setDomain(data.wildcardDomain);
        }
      })
      .catch(() => {});
  }, []);

  async function handleTestToken() {
    if (!apiToken) return;

    setTesting(true);
    setError("");
    setTokenValid(null);

    try {
      const res = await fetch("/api/settings/wildcard/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dnsProvider: "cloudflare",
          dnsApiToken: apiToken,
        }),
      });

      const data = await res.json();
      setTokenValid(data.valid);

      if (!data.valid && data.error) {
        setError(data.error);
      }
    } catch {
      setError("Failed to verify token");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!domain || !apiToken) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/settings/wildcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wildcardDomain: domain,
          dnsProvider: "cloudflare",
          dnsApiToken: apiToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save settings");
        return;
      }

      setSuccess(true);
      setConfig({
        wildcardDomain: domain,
        dnsProvider: "cloudflare",
        configured: true,
        hasToken: true,
      });
      setApiToken("");
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/settings/wildcard", { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to remove settings");
        return;
      }

      setConfig({
        wildcardDomain: null,
        dnsProvider: null,
        configured: false,
        hasToken: false,
      });
      setDomain("");
      setApiToken("");
      setTokenValid(null);
    } catch {
      setError("Failed to remove settings");
    } finally {
      setSaving(false);
    }
  }

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
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={!domain || !apiToken || saving}
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

        <div className="rounded-md bg-neutral-800/50 p-3">
          <p className="text-sm text-neutral-400">
            <strong className="text-neutral-300">Setup required:</strong> Create
            a wildcard A record pointing to your server IP:
          </p>
          <code className="mt-2 block text-sm text-neutral-300">
            *.{domain || "apps.example.com"} → [your server IP]
          </code>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="wildcard-domain" className="text-sm text-neutral-400">
            Wildcard Domain
          </Label>
          <Input
            id="wildcard-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value.replace(/^\*\./, ""))}
            placeholder="apps.example.com"
            disabled={config?.configured}
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
                placeholder="Enter your Cloudflare API token"
                className="h-10 border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600 focus-visible:ring-neutral-700"
              />
              <Button
                variant="secondary"
                onClick={handleTestToken}
                disabled={!apiToken || testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Test"
                )}
              </Button>
            </div>
            <p className="text-xs text-neutral-500">
              Token needs Zone:DNS:Edit permission for your domain
            </p>
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
