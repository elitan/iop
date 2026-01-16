"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddDomain,
  useDeleteDomain,
  useDomains,
  useVerifyDomainDns,
  useVerifyDomainSsl,
} from "@/hooks/use-domains";
import type { Domain } from "@/lib/api";
import { extractSubdomain } from "@/lib/domain-utils";

interface DomainsSectionProps {
  serviceId: string;
  hasRunningDeployment: boolean;
  serverIp: string | null;
  wildcardConfigured?: boolean;
}

export function DomainsSection({
  serviceId,
  hasRunningDeployment,
  serverIp,
  wildcardConfigured = false,
}: DomainsSectionProps) {
  const { data: domains, isLoading } = useDomains(serviceId);
  const addMutation = useAddDomain(serviceId);
  const deleteMutation = useDeleteDomain(serviceId);
  const verifyDnsMutation = useVerifyDomainDns(serviceId);
  const verifySslMutation = useVerifyDomainSsl(serviceId);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [domainType, setDomainType] = useState<"proxy" | "redirect">("proxy");
  const [redirectTarget, setRedirectTarget] = useState("");
  const [redirectCode, setRedirectCode] = useState<"301" | "307">("301");

  const proxyDomains = domains?.filter((d) => d.type === "proxy") || [];
  const systemDomains = domains?.filter((d) => d.isSystem === 1) || [];
  const customDomains = domains?.filter((d) => d.isSystem !== 1) || [];
  const hasOtherVerifiedDomains =
    customDomains.filter((d) => d.dnsVerified === 1).length > 0;

  const unverifiedDomainIds = useMemo(
    () => domains?.filter((d) => d.dnsVerified !== 1).map((d) => d.id) || [],
    [domains],
  );

  const pendingSslDomainIds = useMemo(
    () =>
      domains
        ?.filter((d) => d.dnsVerified === 1 && d.sslStatus !== "active")
        .map((d) => d.id) || [],
    [domains],
  );

  useEffect(() => {
    if (unverifiedDomainIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of unverifiedDomainIds) {
        try {
          const result = await verifyDnsMutation.mutateAsync(id);
          if (result.dnsVerified) {
            const domain = domains?.find((d) => d.id === id);
            toast.success(`DNS verified for ${domain?.domain}`);
          }
        } catch {
          // Silently ignore polling errors
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [unverifiedDomainIds, verifyDnsMutation, domains]);

  useEffect(() => {
    if (pendingSslDomainIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of pendingSslDomainIds) {
        try {
          const result = await verifySslMutation.mutateAsync(id);
          if (result.working) {
            const domain = domains?.find((d) => d.id === id);
            toast.success(`SSL active for ${domain?.domain}`);
          }
        } catch {
          // Silently ignore polling errors
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pendingSslDomainIds, verifySslMutation, domains]);

  async function handleAddDomain() {
    if (!newDomain) return;

    try {
      await addMutation.mutateAsync({
        domain: newDomain,
        type: domainType,
        redirectTarget: domainType === "redirect" ? redirectTarget : undefined,
        redirectCode:
          domainType === "redirect"
            ? (Number(redirectCode) as 301 | 307)
            : undefined,
      });
      toast.success("Domain added");
      setNewDomain("");
      setRedirectTarget("");
      setRedirectCode("301");
      setDomainType("proxy");
      setShowAddForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add domain");
    }
  }

  async function handleVerifyDns(id: string) {
    try {
      const result = await verifyDnsMutation.mutateAsync(id);
      if (result.dnsVerified) {
        toast.success("DNS verified! Domain is now active.");
      } else {
        toast.error(`DNS not configured. Expected: ${result.serverIp}`);
      }
    } catch (err: any) {
      toast.error(err.message || "DNS verification failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this domain?")) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Domain removed");
    } catch {
      toast.error("Failed to remove domain");
    }
  }

  if (isLoading) {
    return (
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-neutral-300">
            Domains
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-neutral-300">
          <span>Domains</span>
          {!showAddForm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasRunningDeployment && domains && domains.length > 0 && (
          <div className="mb-4 rounded-md bg-yellow-900/20 p-3 text-sm text-yellow-400">
            No running deployment. Domains won't work until service is deployed.
          </div>
        )}

        {showAddForm && (
          <div className="mb-4 rounded-md border border-neutral-800 p-4">
            <h3 className="text-lg font-medium text-white">Add Domain</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Add a domain to connect it to this service.{" "}
              <a
                href="/docs/guides/custom-domains"
                className="text-blue-400 hover:underline"
              >
                Learn more
              </a>
            </p>

            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="h-10 pl-9 border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
              />
            </div>

            <div className="mt-4 space-y-3 rounded-md border border-neutral-800 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="domainType"
                  checked={domainType === "proxy"}
                  onChange={() => setDomainType("proxy")}
                  className="mt-1 h-4 w-4 border-neutral-600 bg-neutral-900 text-white"
                />
                <span className="text-sm text-neutral-200">
                  Connect to Service
                </span>
              </label>

              <div className="border-t border-neutral-800" />

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="domainType"
                  checked={domainType === "redirect"}
                  onChange={() => setDomainType("redirect")}
                  className="mt-1 h-4 w-4 border-neutral-600 bg-neutral-900 text-white"
                />
                <span className="text-sm text-neutral-200">
                  Redirect to Another Domain
                </span>
              </label>

              {domainType === "redirect" && (
                <div className="ml-7 flex gap-2">
                  <Select
                    value={redirectCode}
                    onValueChange={(v) => setRedirectCode(v as "301" | "307")}
                  >
                    <SelectTrigger className="w-[180px] border-neutral-700 bg-neutral-900 text-neutral-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-700 bg-neutral-900">
                      <SelectItem value="301">301 Permanent</SelectItem>
                      <SelectItem value="307">307 Temporary</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={redirectTarget}
                    onValueChange={setRedirectTarget}
                    disabled={proxyDomains.length === 0}
                  >
                    <SelectTrigger className="flex-1 border-neutral-700 bg-neutral-900 text-neutral-300">
                      <SelectValue
                        placeholder={
                          proxyDomains.length === 0
                            ? "No domains available"
                            : "Select domain"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-700 bg-neutral-900">
                      {proxyDomains.map((d) => (
                        <SelectItem key={d.id} value={d.domain}>
                          {d.domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setNewDomain("");
                  setRedirectTarget("");
                  setRedirectCode("301");
                  setDomainType("proxy");
                }}
                className="border-neutral-700 text-neutral-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddDomain}
                disabled={
                  addMutation.isPending ||
                  !newDomain ||
                  (domainType === "redirect" && !redirectTarget)
                }
              >
                {addMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>
        )}

        {systemDomains.length > 0 && (
          <div className="space-y-2">
            {systemDomains.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                serverIp={serverIp}
                onVerify={() => handleVerifyDns(domain.id)}
                onDelete={() => handleDelete(domain.id)}
                isVerifying={verifyDnsMutation.isPending}
                canDelete={hasOtherVerifiedDomains}
              />
            ))}
          </div>
        )}

        {customDomains.length > 0 && (
          <div
            className={
              systemDomains.length > 0 ? "mt-4 space-y-2" : "space-y-2"
            }
          >
            {systemDomains.length > 0 && (
              <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                Custom Domains
              </h4>
            )}
            {customDomains.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                serverIp={serverIp}
                onVerify={() => handleVerifyDns(domain.id)}
                onDelete={() => handleDelete(domain.id)}
                isVerifying={verifyDnsMutation.isPending}
                canDelete={true}
              />
            ))}
          </div>
        )}

        {domains && domains.length === 0 && !showAddForm && (
          <div className="text-sm text-neutral-500">
            <p>No domains configured.</p>
            {!wildcardConfigured && (
              <p className="mt-2">
                Configure a{" "}
                <a
                  href="/settings/domain"
                  className="text-blue-400 hover:underline"
                >
                  wildcard domain
                </a>{" "}
                in settings for auto-generated URLs, or add a custom domain
                below.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DomainRowProps {
  domain: Domain;
  serverIp: string | null;
  onVerify: () => void;
  onDelete: () => void;
  isVerifying: boolean;
  canDelete: boolean;
}

function CopyButton({ text }: { text: string }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-5 w-5 text-neutral-500 hover:text-neutral-300"
      title="Copy to clipboard"
    >
      <Copy className="h-3 w-3" />
    </Button>
  );
}

function DomainRow({
  domain,
  serverIp,
  onVerify,
  onDelete,
  isVerifying,
  canDelete,
}: DomainRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isVerified = domain.dnsVerified === 1;
  const isActive = domain.sslStatus === "active";
  const isSystem = domain.isSystem === 1;
  const subdomain = extractSubdomain(domain.domain);

  return (
    <div className="rounded-md border border-neutral-800">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          {isVerified ? (
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          <div>
            <div className="flex items-center gap-2">
              {domain.type === "redirect" ? (
                <span className="flex items-center gap-1 text-sm text-neutral-300">
                  {domain.domain}
                  <ArrowRight className="h-3 w-3 text-neutral-500" />
                  <span className="text-neutral-400">
                    {domain.redirectTarget}
                  </span>
                </span>
              ) : isVerified ? (
                <a
                  href={`https://${domain.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-white hover:text-blue-400"
                >
                  {domain.domain}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-sm text-white">{domain.domain}</span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {isSystem && (
                <Badge
                  variant="outline"
                  className="border-neutral-700 text-neutral-400 text-xs"
                >
                  Auto-generated
                </Badge>
              )}
              {isVerified ? (
                isActive ? (
                  <span className="text-xs text-neutral-400">
                    Valid Configuration
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-neutral-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Provisioning SSL...
                  </span>
                )
              ) : (
                !isSystem && (
                  <>
                    <Badge
                      variant="outline"
                      className="border-yellow-800 bg-yellow-900/30 text-yellow-400 text-xs"
                    >
                      Verification Needed
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="h-auto px-1 py-0 text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      Learn more
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </>
                )
              )}
              {domain.type === "redirect" && (
                <Badge
                  variant="outline"
                  className="border-neutral-700 text-neutral-400 text-xs"
                >
                  {domain.redirectCode || 301} redirect
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSystem && (
            <Button
              variant="outline"
              size="sm"
              onClick={onVerify}
              disabled={isVerifying}
              className="border-neutral-700 text-neutral-300"
            >
              {isVerifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Refresh
                </>
              )}
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-neutral-500" />
            </Button>
          )}
        </div>
      </div>

      {!isVerified && isExpanded && serverIp && (
        <div className="border-t border-neutral-800 p-4">
          <p className="text-sm text-neutral-400 mb-3">
            Configure your DNS provider with these records:
          </p>
          <div className="rounded-md border border-neutral-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="text-left text-neutral-400 font-medium px-3 py-2">
                    Type
                  </th>
                  <th className="text-left text-neutral-400 font-medium px-3 py-2">
                    Name
                  </th>
                  <th className="text-left text-neutral-400 font-medium px-3 py-2">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-neutral-700">
                  <td className="px-3 py-2 text-neutral-300">A</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <code className="text-neutral-200">{subdomain}</code>
                      <CopyButton text={subdomain} />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <code className="text-neutral-200">{serverIp}</code>
                      <CopyButton text={serverIp} />
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            DNS changes can take up to 48 hours to propagate.
          </p>
        </div>
      )}
    </div>
  );
}
