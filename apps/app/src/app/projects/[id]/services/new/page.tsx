"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { EnvVarEditor } from "@/components/env-var-editor";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useProject } from "@/hooks/use-projects";
import { useCreateService } from "@/hooks/use-services";
import type { CreateServiceInput, EnvVar } from "@/lib/api";
import { api } from "@/lib/api";
import { RepoSelector } from "./_components/repo-selector";

type DeployType = "repo" | "image" | "database";

export default function NewServicePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { data: project } = useProject(projectId);
  const createMutation = useCreateService(projectId);
  const [deployType, setDeployType] = useState<DeployType>("repo");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<{
    url: string;
    branch: string;
    name: string;
    ownerAvatar?: string;
  } | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedDbTemplate, setSelectedDbTemplate] = useState<string>("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef<HTMLInputElement>(null);
  const containerPortRef = useRef<HTMLInputElement>(null);

  const { data: dbTemplates } = useQuery({
    queryKey: ["db-templates"],
    queryFn: () => api.dbTemplates.list(),
  });

  const { data: serviceTemplates } = useQuery({
    queryKey: ["service-templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates/services");
      return res.json();
    },
  });

  const { data: registries } = useQuery({
    queryKey: ["registries"],
    queryFn: async () => {
      const res = await fetch("/api/registries");
      return res.json();
    },
  });

  const [selectedRegistryId, setSelectedRegistryId] = useState<string>("");

  function handleTemplateChange(templateId: string) {
    setSelectedTemplate(templateId);
    const templates = serviceTemplates?.filter(
      (t: { type: string }) => t.type === "service",
    );
    const template = templates?.find(
      (t: { id: string }) => t.id === templateId,
    );
    if (template) {
      const serviceName = Object.keys(template.services)[0];
      const svc = template.services[serviceName];
      if (imageUrlRef.current) {
        imageUrlRef.current.value = svc.image;
      }
      if (containerPortRef.current) {
        containerPortRef.current.value = String(svc.port ?? 8080);
      }
      if (nameInputRef.current && !nameInputRef.current.value) {
        nameInputRef.current.value = template.id;
      }
    }
  }

  function handleDbTemplateChange(templateId: string) {
    setSelectedDbTemplate(templateId);
    const template = dbTemplates?.find((t) => t.id === templateId);
    if (template && nameInputRef.current && !nameInputRef.current.value) {
      nameInputRef.current.value = template.id.split("-")[0];
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const validEnvVars = envVars.filter((v) => v.key.trim() !== "");
    const containerPort = parseInt(
      formData.get("container_port") as string,
      10,
    );

    const data: CreateServiceInput = {
      name: formData.get("name") as string,
      deployType: deployType,
      envVars: validEnvVars,
      containerPort: containerPort || 8080,
    };

    if (deployType === "repo") {
      data.repoUrl = formData.get("repo_url") as string;
      data.branch = (formData.get("branch") as string) || "main";
      data.dockerfilePath =
        (formData.get("dockerfile_path") as string) || "Dockerfile";
      data.buildContext =
        (formData.get("build_context") as string) || undefined;
    } else if (deployType === "image") {
      data.imageUrl = formData.get("image_url") as string;
      if (selectedRegistryId && selectedRegistryId !== "auto") {
        data.registryId = selectedRegistryId;
      }
    } else if (deployType === "database") {
      data.templateId = selectedDbTemplate;
    }

    try {
      await createMutation.mutateAsync(data);
      toast.success("Service created");
      router.push(`/projects/${projectId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create service";
      toast.error(message);
    }
  }

  return (
    <>
      <Header>
        <BreadcrumbHeader
          items={[
            { label: project?.name ?? "...", href: `/projects/${projectId}` },
            { label: "New Service" },
          ]}
        />
      </Header>
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-lg">
          <Card className="border-neutral-800 bg-neutral-900">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-neutral-100">
                New Service
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <Label htmlFor="name" className="text-neutral-300">
                      Name
                    </Label>
                    <Input
                      ref={nameInputRef}
                      id="name"
                      name="name"
                      required
                      placeholder="api"
                      className="border-neutral-700 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500"
                    />
                    <p className="text-xs text-neutral-500">
                      Other services can reach this service using this name as
                      hostname.{" "}
                      <a
                        href="/docs/concepts/services"
                        className="text-blue-400 hover:underline"
                      >
                        Learn more
                      </a>
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <Label className="text-neutral-300">Deploy Type</Label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deploy_type"
                          value="repo"
                          checked={deployType === "repo"}
                          onChange={() => setDeployType("repo")}
                          className="accent-blue-500"
                        />
                        <span className="text-sm text-neutral-300">
                          Build from Repository
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deploy_type"
                          value="image"
                          checked={deployType === "image"}
                          onChange={() => setDeployType("image")}
                          className="accent-blue-500"
                        />
                        <span className="text-sm text-neutral-300">
                          Use Docker Image
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deploy_type"
                          value="database"
                          checked={deployType === "database"}
                          onChange={() => setDeployType("database")}
                          className="accent-blue-500"
                        />
                        <span className="flex items-center gap-1.5 text-sm text-neutral-300">
                          <Database className="h-3.5 w-3.5" />
                          Database
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <Separator className="bg-neutral-800" />

                {deployType === "repo" && (
                  <div className="space-y-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                      Import Git Repository
                    </p>

                    {!selectedRepo && !showManualInput ? (
                      <>
                        <RepoSelector
                          onSelect={(repo) => {
                            setSelectedRepo(repo);
                            if (
                              nameInputRef.current &&
                              !nameInputRef.current.value
                            ) {
                              nameInputRef.current.value = repo.name;
                            }
                          }}
                        />
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setShowManualInput(true)}
                            className="text-xs text-neutral-500 hover:text-neutral-300"
                          >
                            Or enter a public repository URL manually
                          </button>
                        </div>
                      </>
                    ) : showManualInput && !selectedRepo ? (
                      <div className="space-y-3">
                        <div className="grid gap-3">
                          <Label
                            htmlFor="repo_url"
                            className="text-neutral-300"
                          >
                            Repository URL
                          </Label>
                          <Input
                            id="repo_url"
                            name="repo_url"
                            required
                            placeholder="https://github.com/user/repo"
                            className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowManualInput(false)}
                          className="text-xs text-neutral-500 hover:text-neutral-300"
                        >
                          ← Back to repository list
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800 p-3">
                          <div className="flex items-center gap-3">
                            {selectedRepo?.ownerAvatar && (
                              <img
                                src={selectedRepo.ownerAvatar}
                                alt=""
                                className="h-6 w-6 rounded-full"
                              />
                            )}
                            <p className="text-sm font-medium text-neutral-100">
                              {selectedRepo?.url.replace(
                                "https://github.com/",
                                "",
                              )}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedRepo(null)}
                          >
                            Change
                          </Button>
                        </div>
                        <input
                          type="hidden"
                          name="repo_url"
                          value={selectedRepo?.url}
                        />
                      </div>
                    )}

                    {(selectedRepo || showManualInput) && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-3">
                          <Label htmlFor="branch" className="text-neutral-300">
                            Branch
                          </Label>
                          <Input
                            id="branch"
                            name="branch"
                            placeholder="main"
                            defaultValue={selectedRepo?.branch || "main"}
                            key={selectedRepo?.branch}
                            className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
                          />
                        </div>

                        <div className="grid gap-3">
                          <Label
                            htmlFor="dockerfile_path"
                            className="text-neutral-300"
                          >
                            Dockerfile
                          </Label>
                          <Input
                            id="dockerfile_path"
                            name="dockerfile_path"
                            placeholder="Dockerfile"
                            defaultValue="Dockerfile"
                            className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
                          />
                        </div>
                      </div>
                    )}

                    {(selectedRepo || showManualInput) && (
                      <div className="grid gap-3">
                        <Label
                          htmlFor="build_context"
                          className="text-neutral-300"
                        >
                          Build Context
                        </Label>
                        <Input
                          id="build_context"
                          name="build_context"
                          placeholder=". (repo root)"
                          className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
                        />
                        <p className="text-xs text-neutral-500">
                          Directory for Docker build context. Leave empty for
                          repo root. Useful for monorepos.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {deployType === "image" && (
                  <div className="space-y-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                      Image Settings
                    </p>

                    <div className="grid gap-3">
                      <Label className="text-neutral-300">Template</Label>
                      <Select
                        value={selectedTemplate}
                        onValueChange={handleTemplateChange}
                      >
                        <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                          <SelectValue placeholder="Select a template (optional)" />
                        </SelectTrigger>
                        <SelectContent className="border-neutral-700 bg-neutral-800">
                          {serviceTemplates
                            ?.filter(
                              (t: { type: string }) => t.type === "service",
                            )
                            .map(
                              (t: {
                                id: string;
                                name: string;
                                description: string;
                              }) => (
                                <SelectItem
                                  key={t.id}
                                  value={t.id}
                                  className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                                >
                                  {t.name} - {t.description}
                                </SelectItem>
                              ),
                            )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-3">
                      <Label htmlFor="image_url" className="text-neutral-300">
                        Image
                      </Label>
                      <Input
                        ref={imageUrlRef}
                        id="image_url"
                        name="image_url"
                        required
                        placeholder="nginx:alpine"
                        className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
                      />
                      <p className="text-xs text-neutral-500">
                        Docker Hub image or full registry URL (e.g.,
                        ghcr.io/user/image:tag)
                      </p>
                    </div>

                    <div className="grid gap-3">
                      <Label className="text-neutral-300">Registry</Label>
                      {registries && registries.length > 0 ? (
                        <>
                          <Select
                            value={selectedRegistryId}
                            onValueChange={setSelectedRegistryId}
                          >
                            <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                              <SelectValue placeholder="Auto-detect from image URL" />
                            </SelectTrigger>
                            <SelectContent className="border-neutral-700 bg-neutral-800">
                              <SelectItem
                                value="auto"
                                className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                              >
                                Auto-detect from image URL
                              </SelectItem>
                              {registries.map(
                                (r: {
                                  id: string;
                                  name: string;
                                  type: string;
                                }) => (
                                  <SelectItem
                                    key={r.id}
                                    value={r.id}
                                    className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                                  >
                                    {r.name}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-neutral-500">
                            Credentials for private registries. Auto-detect uses
                            the registry matching the image URL.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-neutral-500">
                          Pulling from a private registry?{" "}
                          <a
                            href="/settings/registries"
                            className="text-blue-400 hover:underline"
                          >
                            Add credentials in Settings
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {deployType === "database" && (
                  <div className="space-y-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                      Database Settings
                    </p>

                    <div className="grid gap-3">
                      <Label className="text-neutral-300">Database Type</Label>
                      <Select
                        value={selectedDbTemplate}
                        onValueChange={handleDbTemplateChange}
                        required
                      >
                        <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                          <SelectValue placeholder="Select a database" />
                        </SelectTrigger>
                        <SelectContent className="border-neutral-700 bg-neutral-800">
                          {dbTemplates?.map((t) => (
                            <SelectItem
                              key={t.id}
                              value={t.id}
                              className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                            >
                              <span className="flex items-center gap-2">
                                <Database className="h-3.5 w-3.5 text-neutral-400" />
                                {t.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedDbTemplate &&
                      (() => {
                        const template = dbTemplates?.find(
                          (t: { id: string }) => t.id === selectedDbTemplate,
                        );
                        if (!template) return null;
                        const serviceName = Object.keys(template.services)[0];
                        const svc = template.services[serviceName];
                        return (
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-xs text-neutral-400">
                            <p className="mb-2 font-medium text-neutral-300">
                              Auto-configured:
                            </p>
                            <ul className="space-y-1">
                              <li>
                                Image:{" "}
                                <code className="text-neutral-300">
                                  {svc.image}
                                </code>
                              </li>
                              <li>
                                Port:{" "}
                                <code className="text-neutral-300">
                                  {svc.port}
                                </code>
                              </li>
                              <li>Volume mounted for data persistence</li>
                              <li>Credentials auto-generated</li>
                            </ul>
                          </div>
                        );
                      })()}
                  </div>
                )}

                {deployType !== "database" && (
                  <>
                    <Separator className="bg-neutral-800" />

                    <div className="space-y-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                        Container Settings
                      </p>

                      <div className="grid gap-3">
                        <Label
                          htmlFor="container_port"
                          className="text-neutral-300"
                        >
                          Container Port
                        </Label>
                        <Input
                          ref={containerPortRef}
                          id="container_port"
                          name="container_port"
                          type="number"
                          placeholder="8080"
                          defaultValue="8080"
                          min={1}
                          max={65535}
                          className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
                        />
                        <p className="text-xs text-neutral-500">
                          Port your container listens on. Use this if your image
                          ignores the PORT env var.
                        </p>
                      </div>
                    </div>

                    <Separator className="bg-neutral-800" />

                    <div className="space-y-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                        Service Environment Variables
                      </p>
                      <p className="text-xs text-neutral-500">
                        These are in addition to any shared project variables.
                      </p>
                      <EnvVarEditor value={envVars} onChange={setEnvVars} />
                    </div>
                  </>
                )}

                <Separator className="bg-neutral-800" />

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    size="sm"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Creating
                      </>
                    ) : (
                      "Create Service"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => router.back()}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
