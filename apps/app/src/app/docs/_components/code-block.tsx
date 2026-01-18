"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

export function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const language = className?.replace("language-", "") || "";
  const isTerminal = ["bash", "sh", "shell", "zsh", ""].includes(language);

  async function handleCopy() {
    const code = extractText(children);
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="not-prose group relative my-6 overflow-hidden rounded-lg border border-neutral-800 bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-4 py-2">
        <span className="text-xs text-neutral-500">
          {isTerminal ? "terminal" : language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
            "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300",
            copied && "text-green-500",
          )}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto p-4 text-[13px] leading-relaxed",
          "[&::-webkit-scrollbar]:h-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-neutral-800",
        )}
      >
        <code className="text-neutral-300">{children}</code>
      </pre>
    </div>
  );
}

interface NodeWithProps {
  props?: { children?: React.ReactNode };
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const n = node as NodeWithProps;
    return extractText(n.props?.children);
  }
  return "";
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[13px] font-medium text-neutral-200">
      {children}
    </code>
  );
}
