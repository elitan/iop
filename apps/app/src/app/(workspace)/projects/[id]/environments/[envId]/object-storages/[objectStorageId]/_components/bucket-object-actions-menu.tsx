"use client";

import {
  Copy,
  Download,
  Link,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ObjectStorageBucketObject } from "./types";

interface BucketObjectActionsMenuProps {
  object: ObjectStorageBucketObject;
  pending: boolean;
  onDownload(object: ObjectStorageBucketObject): void;
  onCopySignedUrl(object: ObjectStorageBucketObject): void;
  onCopyKey(object: ObjectStorageBucketObject): void;
  onDelete(object: ObjectStorageBucketObject): void;
}

const fileActionItemClassName = "gap-2.5 px-2.5 py-2 text-xs";
const fileActionIconClassName = "h-3.5 w-3.5 shrink-0 text-neutral-400";

export function BucketObjectActionsMenu({
  object,
  pending,
  onDownload,
  onCopySignedUrl,
  onCopyKey,
  onDelete,
}: BucketObjectActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={pending}
          title="File actions"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-48 p-1.5">
        <DropdownMenuItem
          className={fileActionItemClassName}
          onSelect={function handleSelect() {
            onDownload(object);
          }}
        >
          <Download className={fileActionIconClassName} />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem
          className={fileActionItemClassName}
          onSelect={function handleSelect() {
            onCopySignedUrl(object);
          }}
        >
          <Link className={fileActionIconClassName} />
          Copy signed URL
        </DropdownMenuItem>
        <DropdownMenuItem
          className={fileActionItemClassName}
          onSelect={function handleSelect() {
            onCopyKey(object);
          }}
        >
          <Copy className={fileActionIconClassName} />
          Copy key
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`${fileActionItemClassName} text-red-300 focus:text-red-200`}
          onSelect={function handleSelect() {
            onDelete(object);
          }}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-300" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
