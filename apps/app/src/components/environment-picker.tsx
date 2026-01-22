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

interface Environment {
  id: string;
  name: string;
  type: string;
}

interface EnvironmentPickerProps {
  environments: Environment[];
  currentEnvId: string;
  onSelect: (envId: string) => void;
  onCreateNew: () => void;
}

export function EnvironmentPicker({
  environments,
  currentEnvId,
  onSelect,
  onCreateNew,
}: EnvironmentPickerProps) {
  const currentEnv = environments.find((e) => e.id === currentEnvId);
  const currentName = currentEnv?.name ?? "Select environment";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm text-neutral-100 outline-none hover:text-neutral-300">
        {currentName}
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
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
  );
}
