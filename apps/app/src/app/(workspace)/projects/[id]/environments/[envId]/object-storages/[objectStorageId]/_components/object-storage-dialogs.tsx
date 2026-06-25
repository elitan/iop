"use client";

import { KeyRound, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccessKeyPermission } from "./types";

interface CreateBucketDialogProps {
  open: boolean;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onCreateBucket(name: string): Promise<boolean>;
}

interface CreateAccessKeyDialogProps {
  open: boolean;
  pending: boolean;
  bucketName: string | null;
  disabled: boolean;
  onOpenChange(open: boolean): void;
  onCreateKey(input: {
    name: string;
    permissions: AccessKeyPermission;
  }): Promise<boolean>;
}

export function CreateBucketDialog({
  open,
  pending,
  onOpenChange,
  onCreateBucket,
}: CreateBucketDialogProps) {
  const [bucketName, setBucketName] = useState("");

  async function handleCreateBucket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = bucketName.trim();
    if (!name) {
      return;
    }

    const created = await onCreateBucket(name);
    if (created) {
      setBucketName("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">New bucket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateBucket} className="space-y-4">
          <div className="grid gap-1.5">
            <Label
              htmlFor="object_storage_bucket_name"
              className="text-xs text-neutral-400"
            >
              Name
            </Label>
            <Input
              id="object_storage_bucket_name"
              value={bucketName}
              onChange={function handleBucketNameChange(event) {
                setBucketName(event.target.value);
              }}
              placeholder="avatars"
              className="border-neutral-700 bg-neutral-800 font-mono text-sm text-neutral-100"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={function handleCancel() {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !bucketName.trim()}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create bucket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAccessKeyDialog({
  open,
  pending,
  bucketName,
  disabled,
  onOpenChange,
  onCreateKey,
}: CreateAccessKeyDialogProps) {
  const [keyName, setKeyName] = useState("app");
  const [permissions, setPermissions] =
    useState<AccessKeyPermission>("read-write");

  async function handleCreateKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = keyName.trim();
    if (!name || disabled) {
      return;
    }

    const created = await onCreateKey({ name, permissions });
    if (created) {
      setKeyName("app");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-neutral-800 bg-neutral-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">
            {bucketName ? `New key for ${bucketName}` : "New key"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateKey} className="space-y-4">
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label
                htmlFor="access_key_name"
                className="text-xs text-neutral-400"
              >
                Name
              </Label>
              <Input
                id="access_key_name"
                value={keyName}
                onChange={function handleKeyNameChange(event) {
                  setKeyName(event.target.value);
                }}
                className="border-neutral-700 bg-neutral-800 text-neutral-100"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-neutral-400">Permission</Label>
              <Select
                value={permissions}
                onValueChange={function handlePermissionChange(value) {
                  if (
                    value === "read-only" ||
                    value === "read-write" ||
                    value === "full"
                  ) {
                    setPermissions(value);
                  }
                }}
              >
                <SelectTrigger className="border-neutral-700 bg-neutral-800 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-neutral-700 bg-neutral-800">
                  <SelectItem value="read-only">Read only</SelectItem>
                  <SelectItem value="read-write">Read/write</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={function handleCancel() {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || disabled || !keyName.trim()}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
