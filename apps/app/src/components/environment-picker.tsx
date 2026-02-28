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

interface Environment {
  id: string;
  name: string;
  type: string;
}

interface EnvironmentPickerProps {
  environments: Environment[];
  currentEnvId: string;
  textHref: string;
  onSelect: (envId: string) => void;
  onCreateNew: () => void;
}

export function EnvironmentPicker({
  environments,
  currentEnvId,
  textHref,
  onSelect,
  onCreateNew,
}: EnvironmentPickerProps) {
  const currentEnv = environments.find((e) => e.id === currentEnvId);
  const currentName = currentEnv?.name ?? "Select environment";

  return (
    <div className="inline-flex items-center gap-1">
      <Link
        href={textHref}
        className="truncate text-sm text-neutral-100 outline-none transition-colors hover:text-neutral-300"
      >
        {currentName}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-400 outline-none transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            aria-label="Switch environment"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuLabel>Environments</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={currentEnvId} onValueChange={onSelect}>
            {environments.map((env) => (
              <DropdownMenuRadioItem key={env.id} value={env.id}>
                {env.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Environment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
