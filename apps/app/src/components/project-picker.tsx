"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
    <div className="inline-flex items-center gap-1">
      <Link
        href={textHref}
        className="truncate text-sm text-neutral-100 outline-none transition-colors hover:text-neutral-300"
      >
        {currentProjectName}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-400 outline-none transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            aria-label="Switch project"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentProjectId}
            onValueChange={onSelect}
          >
            {projects.map((project) => (
              <DropdownMenuRadioItem key={project.id} value={project.id}>
                {project.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
