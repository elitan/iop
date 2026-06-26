"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateObjectStorageBucketObjectUploadUrl } from "@/hooks/use-object-storages";
import { buildObjectKey, normalizePrefixInput } from "./bucket-object-utils";
import type { ObjectStorageBucket } from "./types";

interface UploadBucketObjectButtonProps {
  objectStorageId: string;
  bucket: ObjectStorageBucket;
  prefixInput: string;
  onUploaded(prefix: string): Promise<void>;
}

export function UploadBucketObjectButton({
  objectStorageId,
  bucket,
  prefixInput,
  onUploaded,
}: UploadBucketObjectButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const createUploadUrlMutation =
    useCreateObjectStorageBucketObjectUploadUrl(objectStorageId);

  async function handleUploadFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const nextPrefix = normalizePrefixInput(prefixInput);
    const key = buildObjectKey(nextPrefix, file.name);

    if (!key) {
      toast.error("File name is required");
      return;
    }

    setPending(true);
    try {
      const upload = await createUploadUrlMutation.mutateAsync({
        bucketId: bucket.id,
        key,
        contentType: file.type || undefined,
      });
      const response = await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      await onUploaded(nextPrefix);
      toast.success("File uploaded");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload file",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex justify-end">
      <Input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        onChange={handleUploadFileChange}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={function handleUploadClick() {
          fileInputRef.current?.click();
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Upload file
      </Button>
    </div>
  );
}
