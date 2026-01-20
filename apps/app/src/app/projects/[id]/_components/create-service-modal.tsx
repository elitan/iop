"use client";

import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  Container,
  Database,
  Github,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateService, useServices } from "@/hooks/use-services";
import type { CreateServiceInput, Template } from "@/lib/api";
import { api } from "@/lib/api";

import { RepoSelector } from "../services/new/_components/repo-selector";

function generateUniqueName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;

  let counter = 2;
  while (existingNames.includes(`${baseName}-${counter}`)) counter++;
  return `${baseName}-${counter}`;
}

function getTemplatePort(template: Template): number {
  const firstService = Object.values(template.services)[0];
  return firstService?.port ?? 8080;
}

function getTemplateImage(template: Template): string {
  const firstService = Object.values(template.services)[0];
  return firstService?.image ?? "";
}

type Step = "category" | "repo" | "database" | "image";

interface CreateServiceModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onServiceCreated?: (serviceId: string) => void;
}

interface CategoryOption {
  id: Step;
  label: string;
  icon: LucideIcon;
  keywords: string[];
}

const CATEGORIES: CategoryOption[] = [
  {
    id: "repo",
    label: "GitHub Repo",
    icon: Github,
    keywords: ["github", "repo", "git", "repository"],
  },
  {
    id: "database",
    label: "Database",
    icon: Database,
    keywords: ["database", "db", "postgres", "mysql", "redis", "mongo"],
  },
  {
    id: "image",
    label: "Docker Image",
    icon: Container,
    keywords: ["docker", "image", "container"],
  },
];

const DB_OPTIONS = [
  { id: "postgres", name: "PostgreSQL", color: "text-blue-400" },
  { id: "mysql", name: "MySQL", color: "text-orange-400" },
  { id: "redis", name: "Redis", color: "text-red-400" },
  { id: "mongodb", name: "MongoDB", color: "text-green-400" },
];

function matchesSearch(search: string, ...terms: string[]): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return terms.some((t) => t.toLowerCase().includes(q));
}

export function CreateServiceModal({
  projectId,
  open,
  onOpenChange,
  onServiceCreated,
}: CreateServiceModalProps): React.ReactElement {
  const createMutation = useCreateService(projectId);
  const [step, setStep] = useState<Step>("category");
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dbSearchInputRef = useRef<HTMLInputElement>(null);
  const imageNameRef = useRef<HTMLInputElement>(null);

  const { data: dbTemplates } = useQuery({
    queryKey: ["db-templates"],
    queryFn: () => api.dbTemplates.list(),
  });

  const { data: serviceTemplates } = useQuery({
    queryKey: ["service-templates"],
    queryFn: () => api.serviceTemplates.list(),
  });

  const { data: existingServices } = useServices(projectId);

  const existingServiceNames = (existingServices ?? []).map((s) => s.name);

  const filteredCategories = CATEGORIES.filter((cat) =>
    matchesSearch(search, cat.label, ...cat.keywords),
  );

  const filteredDbOptions = DB_OPTIONS.filter((db) =>
    matchesSearch(search, db.name, db.id),
  );

  useEffect(() => {
    if (!open) return;
    const inputRefs: Record<
      Step,
      React.RefObject<HTMLInputElement | null> | null
    > = {
      category: searchInputRef,
      database: dbSearchInputRef,
      repo: null,
      image: null,
    };
    const ref = inputRefs[step];
    if (ref) setTimeout(() => ref.current?.focus(), 0);
  }, [open, step]);

  function resetState(): void {
    setStep("category");
    setSearch("");
    setSelectedIndex(0);
  }

  function handleOpenChange(isOpen: boolean): void {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  }

  function handleSearchKeyDown(
    e: React.KeyboardEvent,
    items: { id: string }[],
    onSelect: (id: string) => void,
  ): void {
    switch (e.key) {
      case "Backspace":
        if (search === "") {
          e.preventDefault();
          resetState();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (items.length > 0 && items[selectedIndex]) {
          e.preventDefault();
          onSelect(items[selectedIndex].id);
        }
        break;
    }
  }

  function handleCategorySelect(id: string): void {
    setSearch("");
    setSelectedIndex(0);
    setStep(id as Step);
  }

  async function createService(input: CreateServiceInput): Promise<void> {
    try {
      const result = await createMutation.mutateAsync(input);
      toast.success("Service created");
      resetState();
      onOpenChange(false);
      if (onServiceCreated && result.id) {
        onServiceCreated(result.id);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create service";
      toast.error(message);
    }
  }

  async function handleRepoSelect(repo: {
    url: string;
    branch: string;
    name: string;
  }) {
    await createService({
      name: repo.name,
      deployType: "repo",
      repoUrl: repo.url,
      branch: repo.branch,
      dockerfilePath: "Dockerfile",
      containerPort: 8080,
      envVars: [],
    });
  }

  async function handleDbSelect(dbId: string) {
    const template = (dbTemplates ?? []).find((t) => t.id.startsWith(dbId));
    if (!template) return;

    const baseName = template.id.split("-")[0];
    const name = generateUniqueName(baseName, existingServiceNames);

    await createService({
      name,
      deployType: "database",
      templateId: template.id,
      containerPort: getTemplatePort(template),
      envVars: [],
    });
  }

  async function handleImageSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const imageName = imageNameRef.current?.value.trim();
    if (!imageName) return;

    const baseName = imageName.split("/").pop()?.split(":")[0] || "service";
    const name = generateUniqueName(baseName, existingServiceNames);
    await createService({
      name,
      deployType: "image",
      imageUrl: imageName,
      containerPort: 8080,
      envVars: [],
    });
  }

  async function handleTemplateSelect(templateId: string) {
    const template = (serviceTemplates ?? []).find(
      (t: Template) => t.id === templateId,
    );
    if (!template) return;

    const name = generateUniqueName(template.id, existingServiceNames);
    await createService({
      name,
      deployType: "image",
      imageUrl: getTemplateImage(template),
      containerPort: getTemplatePort(template),
      envVars: [],
    });
  }

  function handleSearchChange(value: string): void {
    setSearch(value);
    setSelectedIndex(0);
  }

  function handleImageKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Backspace" && imageNameRef.current?.value === "") {
      e.preventDefault();
      resetState();
    }
  }

  const STEP_TITLES: Record<Step, string> = {
    category: "Add New Service",
    repo: "Import from GitHub",
    database: "Add Database",
    image: "Deploy Docker Image",
  };

  function renderStepContent(): React.ReactElement {
    switch (step) {
      case "category":
        return (
          <div className="space-y-3">
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) =>
                handleSearchKeyDown(e, filteredCategories, handleCategorySelect)
              }
              placeholder="What do you need?"
              className="border-neutral-700 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500"
            />
            <div className="space-y-1">
              {filteredCategories.map((cat, index) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategorySelect(cat.id)}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                      index === selectedIndex
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-neutral-400" />
                      <span className="text-sm text-neutral-100">
                        {cat.label}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-500" />
                  </button>
                );
              })}
              {filteredCategories.length === 0 && (
                <p className="py-4 text-center text-sm text-neutral-500">
                  No matches
                </p>
              )}
            </div>
          </div>
        );

      case "repo":
        return (
          <div className="space-y-4">
            <button
              type="button"
              onClick={resetState}
              className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <RepoSelector onSelect={handleRepoSelect} />
          </div>
        );

      case "database":
        return (
          <div className="space-y-3">
            <Input
              ref={dbSearchInputRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) =>
                handleSearchKeyDown(e, filteredDbOptions, handleDbSelect)
              }
              placeholder="Which database?"
              className="border-neutral-700 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500"
            />
            <div className="space-y-1">
              {filteredDbOptions.map((db, index) => {
                const hasTemplate = (dbTemplates ?? []).some((t) =>
                  t.id.startsWith(db.id),
                );
                if (!hasTemplate) return null;
                return (
                  <button
                    key={db.id}
                    type="button"
                    onClick={() => handleDbSelect(db.id)}
                    disabled={createMutation.isPending}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                      index === selectedIndex
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    <Database className={`h-4 w-4 ${db.color}`} />
                    <span className="text-sm text-neutral-100">{db.name}</span>
                  </button>
                );
              })}
              {filteredDbOptions.length === 0 && (
                <p className="py-4 text-center text-sm text-neutral-500">
                  No matches
                </p>
              )}
            </div>
          </div>
        );

      case "image":
        return (
          <div className="space-y-4">
            <form onSubmit={handleImageSubmit} className="space-y-3">
              <Input
                ref={imageNameRef}
                id="image_name"
                name="image_name"
                autoFocus
                required
                onKeyDown={handleImageKeyDown}
                placeholder="Enter image name..."
                className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
              />
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
                  "Create"
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-neutral-900 px-2 text-xs text-neutral-500">
                  or choose a template
                </span>
              </div>
            </div>

            <Select onValueChange={handleTemplateSelect}>
              <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent className="border-neutral-700 bg-neutral-800">
                {(serviceTemplates ?? []).map((template: Template) => (
                  <SelectItem
                    key={template.id}
                    value={template.id}
                    className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                  >
                    {template.name} - {template.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-neutral-800 bg-neutral-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-neutral-100">
            {STEP_TITLES[step]}
          </DialogTitle>
        </DialogHeader>
        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
