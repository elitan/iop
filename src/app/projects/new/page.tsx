"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BreadcrumbHeader } from "@/components/breadcrumb-header";
import { EnvVarEditor } from "@/components/env-var-editor";
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
import { useCreateProject } from "@/hooks/use-projects";
import type { CreateProjectInput, EnvVar, Template } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const createMutation = useCreateProject();
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: projectTemplates } = useQuery({
    queryKey: ["project-templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates/projects");
      return res.json() as Promise<Template[]>;
    },
  });

  function handleTemplateChange(templateId: string) {
    setSelectedTemplate(templateId);
    const template = projectTemplates?.find((t) => t.id === templateId);
    if (template && nameInputRef.current && !nameInputRef.current.value) {
      nameInputRef.current.value = template.id;
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const validEnvVars = envVars.filter((v) => v.key.trim() !== "");

    const data: CreateProjectInput = {
      name: formData.get("name") as string,
      envVars: validEnvVars,
      templateId: selectedTemplate || undefined,
    };

    try {
      const project = await createMutation.mutateAsync(data);
      toast.success("Project created");
      router.push(`/projects/${project.id}`);
    } catch {
      toast.error("Failed to create project");
    }
  }

  return (
    <>
      <BreadcrumbHeader items={[{ label: "New Project" }]} />
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-lg">
          <Card className="border-neutral-800 bg-neutral-900">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-neutral-100">
                New Project
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {projectTemplates && projectTemplates.length > 0 && (
                  <>
                    <div className="grid gap-3">
                      <Label className="text-neutral-300">Template</Label>
                      <Select
                        value={selectedTemplate}
                        onValueChange={handleTemplateChange}
                      >
                        <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                          <SelectValue placeholder="Start from scratch" />
                        </SelectTrigger>
                        <SelectContent className="border-neutral-700 bg-neutral-800">
                          {projectTemplates.map((t) => (
                            <SelectItem
                              key={t.id}
                              value={t.id}
                              className="text-neutral-100 focus:bg-neutral-700 focus:text-neutral-100"
                            >
                              <span className="flex items-center gap-2">
                                <Package className="h-3.5 w-3.5 text-neutral-400" />
                                {t.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-neutral-500">
                        Templates pre-configure multiple services. Leave empty
                        to start from scratch.
                      </p>
                    </div>

                    {selectedTemplate &&
                      (() => {
                        const template = projectTemplates.find(
                          (t) => t.id === selectedTemplate,
                        );
                        if (!template) return null;
                        const serviceCount = Object.keys(
                          template.services,
                        ).length;
                        return (
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-xs text-neutral-400">
                            <p className="mb-2 font-medium text-neutral-300">
                              {template.description}
                            </p>
                            <p>
                              Creates {serviceCount} service
                              {serviceCount > 1 ? "s" : ""}:{" "}
                              {Object.keys(template.services).join(", ")}
                            </p>
                            {template.docs && (
                              <p className="mt-2">
                                <a
                                  href={template.docs}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline"
                                >
                                  Documentation
                                </a>
                              </p>
                            )}
                          </div>
                        );
                      })()}

                    <Separator className="bg-neutral-800" />
                  </>
                )}

                <div className="grid gap-3">
                  <Label htmlFor="name" className="text-neutral-300">
                    Name
                  </Label>
                  <Input
                    ref={nameInputRef}
                    id="name"
                    name="name"
                    required
                    placeholder="my-project"
                    className="border-neutral-700 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500"
                  />
                  <p className="text-xs text-neutral-500">
                    A project groups related services that share the same
                    network.
                  </p>
                </div>

                <Separator className="bg-neutral-800" />

                <div className="space-y-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Shared Environment Variables
                  </p>
                  <p className="text-xs text-neutral-500">
                    These variables will be inherited by all services in this
                    project.
                  </p>
                  <EnvVarEditor value={envVars} onChange={setEnvVars} />
                </div>

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
                      "Create Project"
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
