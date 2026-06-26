"use client";

import { ChevronLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateObjectStorage,
  useObjectStorages,
} from "@/hooks/use-object-storages";
import { generateUniqueName } from "./resource-name";

interface ObjectStorageCreateFormProps {
  projectId: string;
  environmentId: string;
  onBack: () => void;
  onCreated: (objectStorageId: string) => void;
}

export function ObjectStorageCreateForm({
  projectId,
  environmentId,
  onBack,
  onCreated,
}: ObjectStorageCreateFormProps): React.ReactElement {
  const createObjectStorageMutation = useCreateObjectStorage(projectId);
  const { data: existingObjectStorages = [] } = useObjectStorages(projectId);
  const [name, setName] = useState("");
  const existingNames = existingObjectStorages
    .filter(function byEnvironment(objectStorage) {
      return objectStorage.environmentId === environmentId;
    })
    .map(function getName(objectStorage) {
      return objectStorage.name;
    });
  const nextName = generateUniqueName("object storage", existingNames);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const storageName = name.trim() || nextName;

    try {
      const result = await createObjectStorageMutation.mutateAsync({
        environmentId,
        name: storageName,
      });
      toast.success("Object storage created");
      onCreated(result.objectStorage.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create object storage",
      );
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <label
            htmlFor="object_storage_name"
            className="text-xs font-medium text-neutral-400"
          >
            Name
          </label>
          <Input
            id="object_storage_name"
            value={name}
            onChange={function onNameChange(event) {
              setName(event.target.value);
            }}
            placeholder={nextName}
            className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100 placeholder:text-neutral-500"
          />
        </div>
        <Button
          type="submit"
          disabled={createObjectStorageMutation.isPending}
          size="sm"
        >
          {createObjectStorageMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Creating
            </>
          ) : (
            "Create object storage"
          )}
        </Button>
      </form>
    </div>
  );
}
