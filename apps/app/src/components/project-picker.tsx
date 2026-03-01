"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
}

interface ProjectPickerProps {
  projects: Project[];
  currentProjectId: string;
  currentProjectName: string;
  textHref: string;
  onSelect: (projectId: string) => void;
  onCreateNew: () => void;
}

export function ProjectPicker({
  projects,
  currentProjectId,
  currentProjectName,
  textHref,
  onSelect,
  onCreateNew,
}: ProjectPickerProps) {
  return (
    <DropdownMenu>
      <div className="flex w-full items-center gap-1">
        <Link
          href={textHref}
          className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-transparent px-2 text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-800 hover:bg-neutral-900"
        >
          <span className="truncate">{currentProjectName}</span>
        </Link>

        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-neutral-400 outline-none transition-colors hover:border-neutral-800 hover:bg-neutral-900 hover:text-neutral-100 data-[state=open]:border-neutral-800 data-[state=open]:bg-neutral-900 data-[state=open]:text-neutral-100"
            aria-label="Switch project"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={currentProjectId}
          onValueChange={onSelect}
        >
          {projects.map(function renderProject(project) {
            return (
              <DropdownMenuRadioItem
                key={project.id}
                value={project.id}
                className="w-full"
              >
                {project.name}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCreateNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
