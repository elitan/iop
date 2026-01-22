"use client";

import { ChevronDown, Plus } from "lucide-react";
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
  onSelect: (projectId: string) => void;
  onCreateNew: () => void;
}

export function ProjectPicker({
  projects,
  currentProjectId,
  currentProjectName,
  onSelect,
  onCreateNew,
}: ProjectPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm text-neutral-100 outline-none hover:text-neutral-300">
        {currentProjectName}
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
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
  );
}
