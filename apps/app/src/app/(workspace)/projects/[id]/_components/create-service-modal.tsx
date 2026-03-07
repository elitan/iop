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
import { nanoid } from "nanoid";
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
import { useCreateDatabase, useDatabases } from "@/hooks/use-databases";
import {
  useBatchCreateServices,
  useCreateService,
  useScanRepo,
  useServices,
} from "@/hooks/use-services";
import type { CreateServiceInput, Template } from "@/lib/api";
import { api } from "@/lib/api";
import {
  DATABASE_LOGO_FALLBACK,
  getDatabaseLogoAlt,
  getDatabaseLogoUrl,
} from "@/lib/database-logo";
import { RepoSelector } from "../services/new/_components/repo-selector";
import { DatabaseImportWizard } from "./database-import-wizard";
import { type StagedService, StagedServicesList } from "./staged-services-list";

function generateUniqueName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;

  let counter = 2;
  while (existingNames.includes(`${baseName}-${counter}`)) counter++;
  return `${baseName}-${counter}`;
}

type Step = "category" | "repo" | "scanning" | "staged" | "image" | "database";
type DatabaseMode = "menu" | "create" | "import";

interface CreateServiceModalProps {
  projectId: string;
  environmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onServiceCreated?: (serviceId: string) => void;
  onDatabaseCreated?: (databaseId: string) => void;
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
    id: "image",
    label: "Docker Image",
    icon: Container,
    keywords: ["docker", "image", "container"],
  },
  {
    id: "database",
    label: "Database",
    icon: Database,
    keywords: ["database", "postgres", "postgresql", "mysql", "sql"],
  },
];

function matchesSearch(query: string, ...terms: string[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return terms.some((term) => term.toLowerCase().includes(q));
}

function getDatabaseEngineLabel(engine: "postgres" | "mysql"): string {
  if (engine === "postgres") {
    return "Postgres";
  }
  return "MySQL";
}

const DATABASE_ENGINE_OPTIONS: Array<{
  engine: "postgres" | "mysql";
  label: string;
  description: string;
}> = [
  {
    engine: "postgres",
    label: "Postgres",
    description: "Fast default setup",
  },
  {
    engine: "mysql",
    label: "MySQL",
    description: "Compatible with MySQL apps",
  },
];

export function CreateServiceModal({
  projectId,
  environmentId,
  open,
  onOpenChange,
  onServiceCreated,
  onDatabaseCreated,
}: CreateServiceModalProps): React.ReactElement {
  const createMutation = useCreateService(environmentId);
  const createDatabaseMutation = useCreateDatabase(projectId);
  const scanMutation = useScanRepo();
  const batchCreateMutation = useBatchCreateServices(environmentId);

  const [step, setStep] = useState<Step>("category");
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const imageNameRef = useRef<HTMLInputElement>(null);

  const [stagedServices, setStagedServices] = useState<StagedService[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<{
    url: string;
    branch: string;
    name: string;
  } | null>(null);
  const [databaseEngine, setDatabaseEngine] = useState<"postgres" | "mysql">(
    "postgres",
  );
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>("menu");

  const { data: serviceTemplates } = useQuery({
    queryKey: ["service-templates"],
    queryFn: () => api.serviceTemplates.list(),
  });

  const { data: existingServices } = useServices(environmentId);
  const { data: existingDatabases = [] } = useDatabases(projectId);

  const existingServiceNames = (existingServices ?? []).map((s) => s.name);
  const existingDatabaseNames = existingDatabases.map(
    function getName(database) {
      return database.name;
    },
  );
  const nextDatabaseName = generateUniqueName(
    databaseEngine,
    existingDatabaseNames,
  );
  const nextImportDatabaseName = generateUniqueName(
    "postgres",
    existingDatabaseNames,
  );

  const filteredCategories = CATEGORIES.filter((cat) =>
    matchesSearch(search, cat.label, ...cat.keywords),
  );

  useEffect(() => {
    if (!open) return;
    const inputRefs: Record<
      Step,
      React.RefObject<HTMLInputElement | null> | null
    > = {
      category: searchInputRef,
      repo: null,
      scanning: null,
      staged: null,
      image: null,
      database: null,
    };
    const ref = inputRefs[step];
    if (ref) setTimeout(() => ref.current?.focus(), 0);
  }, [open, step]);

  function resetState(): void {
    setStep("category");
    setSearch("");
    setSelectedIndex(0);
    setStagedServices([]);
    setSelectedRepo(null);
    setDatabaseEngine("postgres");
    setDatabaseMode("menu");
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
    if (e.key === "Backspace" && search === "") {
      e.preventDefault();
      resetState();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && items[selectedIndex]) {
      e.preventDefault();
      onSelect(items[selectedIndex].id);
    }
  }

  function handleCategorySelect(id: string): void {
    setSearch("");
    setSelectedIndex(0);
    if (id === "database") {
      setDatabaseMode("menu");
    }
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
    setSelectedRepo(repo);
    setStep("scanning");

    try {
      const result = await scanMutation.mutateAsync({
        repoUrl: repo.url,
        branch: repo.branch,
        repoName: repo.name,
      });

      if (result.dockerfiles.length === 0) {
        toast.error("No Dockerfiles found in repository");
        setStep("repo");
        return;
      }

      const staged: StagedService[] = result.dockerfiles.map((df) => ({
        id: nanoid(),
        name: df.suggestedName,
        dockerfilePath: df.path,
        buildContext: df.buildContext,
        containerPort: df.detectedPort ?? 8080,
        enabled: true,
        frostFilePath: df.frostConfig?.frostFilePath,
        healthCheckPath: df.frostConfig?.healthCheckPath,
        healthCheckTimeout: df.frostConfig?.healthCheckTimeout,
        memoryLimit: df.frostConfig?.memoryLimit,
        cpuLimit: df.frostConfig?.cpuLimit,
      }));

      setStagedServices(staged);
      setStep("staged");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to scan repository";
      toast.error(message);
      setStep("repo");
    }
  }

  async function handleBatchCreate() {
    if (!selectedRepo) return;

    const enabledServices = stagedServices.filter((s) => s.enabled);
    if (enabledServices.length === 0) return;

    try {
      const result = await batchCreateMutation.mutateAsync({
        repoUrl: selectedRepo.url,
        branch: selectedRepo.branch,
        services: enabledServices.map((s) => ({
          name: s.name,
          dockerfilePath: s.dockerfilePath,
          buildContext: s.buildContext,
          containerPort: s.containerPort,
          healthCheckPath: s.healthCheckPath,
          healthCheckTimeout: s.healthCheckTimeout,
          memoryLimit: s.memoryLimit,
          cpuLimit: s.cpuLimit,
        })),
      });

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          toast.error(`Failed to create ${error.name}: ${error.error}`);
        }
      }

      if (result.created.length > 0) {
        toast.success(
          `Created ${result.created.length} service${result.created.length !== 1 ? "s" : ""}`,
        );
        resetState();
        onOpenChange(false);

        if (onServiceCreated && result.created[0]) {
          onServiceCreated(result.created[0].id);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create services";
      toast.error(message);
    }
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
      serviceTemplateId: templateId,
      envVars: [],
    });
  }

  async function handleDatabaseSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    const nextName = generateUniqueName(databaseEngine, existingDatabaseNames);

    try {
      const result = await createDatabaseMutation.mutateAsync({
        name: nextName,
        engine: databaseEngine,
      });
      toast.success("Database created");
      resetState();
      onOpenChange(false);
      if (onDatabaseCreated) onDatabaseCreated(result.database.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create database";
      toast.error(message);
    }
  }

  function handleImportFinished(databaseId: string): void {
    resetState();
    onOpenChange(false);
    if (onDatabaseCreated) {
      onDatabaseCreated(databaseId);
    }
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
    scanning: "Scanning Repository...",
    staged: "Configure Services",
    image: "Deploy Docker Image",
    database: "Create Database",
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

      case "scanning":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="mt-4 text-sm text-neutral-400">
              Scanning for Dockerfiles...
            </p>
          </div>
        );

      case "staged":
        return (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStep("repo")}
              className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {selectedRepo && (
              <p className="text-sm text-neutral-400">
                <span className="font-mono text-neutral-300">
                  {selectedRepo.name}
                </span>{" "}
                ({selectedRepo.branch})
              </p>
            )}
            <StagedServicesList
              services={stagedServices}
              onChange={setStagedServices}
              onCancel={resetState}
              onSubmit={handleBatchCreate}
              isLoading={batchCreateMutation.isPending}
            />
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

      case "database":
        if (databaseMode === "import") {
          return (
            <DatabaseImportWizard
              projectId={projectId}
              initialTargetName={nextImportDatabaseName}
              onBack={function onBack() {
                setDatabaseMode("menu");
              }}
              onFinished={handleImportFinished}
            />
          );
        }

        if (databaseMode === "menu") {
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
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={function onCreateEmptyClick() {
                    setDatabaseMode("create");
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-600"
                >
                  <p className="text-sm font-medium text-neutral-100">
                    Create empty database
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Start with a fresh Postgres or MySQL database
                  </p>
                </button>
                <button
                  type="button"
                  onClick={function onImportClick() {
                    setDatabaseMode("import");
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-600"
                >
                  <p className="text-sm font-medium text-neutral-100">
                    Import existing Postgres
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Paste a database URL and let Frost move it
                  </p>
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <button
              type="button"
              onClick={function onBack() {
                setDatabaseMode("menu");
              }}
              className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <form onSubmit={handleDatabaseSubmit} className="space-y-3">
              <div role="radiogroup" className="space-y-2">
                {DATABASE_ENGINE_OPTIONS.map(
                  function renderEngineOption(option) {
                    const isSelected = databaseEngine === option.engine;
                    return (
                      <button
                        key={option.engine}
                        type="button"
                        onClick={function selectEngine() {
                          setDatabaseEngine(option.engine);
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-neutral-500 bg-neutral-800"
                            : "border-neutral-700 bg-neutral-900 hover:border-neutral-600"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-800">
                              <img
                                src={getDatabaseLogoUrl(option.engine)}
                                alt={getDatabaseLogoAlt(option.engine)}
                                className="h-4 w-4 object-contain"
                                onError={function onLogoError(event) {
                                  if (
                                    event.currentTarget.src ===
                                    DATABASE_LOGO_FALLBACK
                                  ) {
                                    return;
                                  }
                                  event.currentTarget.src =
                                    DATABASE_LOGO_FALLBACK;
                                }}
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-neutral-100">
                                {option.label}
                              </p>
                              <p className="mt-0.5 text-xs text-neutral-400">
                                {option.description}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`h-4 w-4 shrink-0 rounded-full border ${
                              isSelected
                                ? "border-neutral-300 bg-neutral-300"
                                : "border-neutral-600"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Name auto-generated:{" "}
                <span className="font-mono text-neutral-300">
                  {nextDatabaseName}
                </span>
              </p>
              <Button
                type="submit"
                disabled={createDatabaseMutation.isPending}
                size="sm"
              >
                {createDatabaseMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Creating
                  </>
                ) : (
                  `Create ${getDatabaseEngineLabel(databaseEngine)}`
                )}
              </Button>
            </form>
          </div>
        );
    }
  }

  function getDialogTitle(): string {
    if (step === "database") {
      if (databaseMode === "import") {
        return "Import Existing Postgres";
      }
      if (databaseMode === "menu") {
        return "Database";
      }
    }
    return STEP_TITLES[step];
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`max-h-[85vh] overflow-y-auto border-neutral-800 bg-neutral-900 ${
          step === "database" && databaseMode === "import"
            ? "sm:max-w-3xl"
            : "sm:max-w-md"
        }`}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-neutral-100">
            {getDialogTitle()}
          </DialogTitle>
        </DialogHeader>
        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
