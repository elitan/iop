"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingCard } from "@/components/setting-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/orpc-client";

interface DnsStatus {
  valid: boolean;
  serverIp: string;
  domainIp: string | null;
}

export function SslSection() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);
  const [sslStatus, setSslStatus] = useState<"true" | "pending" | "false">(
    "false",
  );
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null);
  const [staging, setStaging] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const { data: settings } = useQuery(orpc.settings.get.queryOptions());

  useEffect(() => {
    if (settings) {
      if (settings.domain) {
        setCurrentDomain(settings.domain);
        setDomain(settings.domain);
      }
      if (settings.email) {
        setEmail(settings.email);
      }
      if (settings.sslEnabled === "true" || settings.sslEnabled === "pending") {
        setSslStatus(settings.sslEnabled);
      }
    }
  }, [settings]);

  const verifySslMutation = useMutation(
    orpc.settings.verifySsl.mutationOptions(),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional polling pattern
  useEffect(() => {
    if (sslStatus !== "pending" || !currentDomain) return;

    const startTime = Date.now();
    const maxDuration = 60000;

    const interval = setInterval(async () => {
      if (Date.now() - startTime > maxDuration) {
        clearInterval(interval);
        setPollingTimedOut(true);
        return;
      }

      try {
        const result = await verifySslMutation.mutateAsync({
          domain: currentDomain,
        });
        if (result.working) {
          clearInterval(interval);
          setSslStatus("true");
          setSuccess(true);
          await queryClient.refetchQueries({
            queryKey: orpc.settings.get.key(),
          });
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [sslStatus, currentDomain]);

  const verifyDnsMutation = useMutation(
    orpc.settings.verifyDns.mutationOptions({
      onSuccess: (data) => {
        setDnsStatus(data);
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : "DNS verification failed",
        );
      },
    }),
  );

  const enableSslMutation = useMutation(
    orpc.settings.enableSsl.mutationOptions({
      onSuccess: () => {
        setCurrentDomain(domain);
        setSslStatus("pending");
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to enable SSL");
      },
    }),
  );

  async function handleVerifyDns() {
    if (!domain) return;
    setError("");
    setDnsStatus(null);
    verifyDnsMutation.mutate({ domain });
  }

  async function handleEnableSsl() {
    if (!domain || !email || !dnsStatus?.valid) return;
    setError("");
    setPollingTimedOut(false);
    enableSslMutation.mutate({ domain, email, staging });
  }

  const enabling = enableSslMutation.isPending;
  const verifying = verifyDnsMutation.isPending;

  return (
    <SettingCard
      title="SSL"
      description="Configure SSL certificates using Let's Encrypt. Verify your domain's DNS first, then enable SSL."
      learnMoreUrl="https://letsencrypt.org/getting-started/"
      learnMoreText="Learn more about SSL"
      footer={
        <Button
          onClick={handleEnableSsl}
          disabled={
            !domain ||
            !email ||
            !dnsStatus?.valid ||
            enabling ||
            sslStatus === "pending"
          }
        >
          {enabling || sslStatus === "pending" ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Configuring...
            </>
          ) : (
            "Enable SSL"
          )}
        </Button>
      }
    >
      <div className="space-y-4">
        {sslStatus === "true" && currentDomain && (
          <div className="flex items-center gap-2 rounded-md bg-green-900/20 p-3 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>
              SSL enabled for{" "}
              <a
                href={`https://${currentDomain}`}
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {currentDomain}
              </a>
            </span>
          </div>
        )}

        {sslStatus === "pending" && currentDomain && !pollingTimedOut && (
          <div className="flex items-center gap-2 rounded-md bg-blue-900/20 p-3 text-blue-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Configuring SSL... This may take up to 60 seconds.</span>
          </div>
        )}

        {sslStatus === "pending" && pollingTimedOut && (
          <div className="rounded-md bg-yellow-900/20 p-3 text-yellow-400">
            SSL is still being configured. Please wait a few minutes and refresh
            the page.
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-900/20 p-3 text-green-400">
            <p className="font-medium">SSL enabled successfully!</p>
            <p className="mt-1 text-sm">
              Your site is now available at{" "}
              <a
                href={`https://${domain}`}
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://{domain}
              </a>
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="ssl-domain" className="text-sm text-neutral-400">
            Domain
          </Label>
          <div className="flex gap-2">
            <Input
              id="ssl-domain"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setDnsStatus(null);
              }}
              placeholder="frost.example.com"
              className="h-10 border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600 focus-visible:ring-neutral-700"
            />
            <Button
              variant="secondary"
              onClick={handleVerifyDns}
              disabled={!domain || verifying}
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Verify"
              )}
            </Button>
          </div>
        </div>

        {dnsStatus && (
          <div
            className={`flex items-start gap-2 rounded-md p-3 ${
              dnsStatus.valid
                ? "bg-green-900/20 text-green-400"
                : "bg-red-900/20 text-red-400"
            }`}
          >
            {dnsStatus.valid ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="text-sm">
              {dnsStatus.valid ? (
                <span>DNS configured correctly</span>
              ) : (
                <span>
                  Domain points to {dnsStatus.domainIp || "nothing"}.
                  <br />
                  Expected: {dnsStatus.serverIp}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="email" className="text-sm text-neutral-400">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="h-10 border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600 focus-visible:ring-neutral-700"
          />
          <p className="text-xs text-neutral-500">
            Used for Let's Encrypt certificate notifications
          </p>
        </div>

        {sslStatus === "false" && (
          <>
            <div className="flex items-center gap-2">
              <input
                id="staging"
                type="checkbox"
                checked={staging}
                onChange={(e) => setStaging(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-800"
              />
              <Label htmlFor="staging" className="text-neutral-300">
                Use staging certificates (for testing)
              </Label>
            </div>
            {staging && (
              <p className="text-xs text-yellow-500">
                Staging certs are not trusted by browsers. Use only for testing.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </SettingCard>
  );
}
