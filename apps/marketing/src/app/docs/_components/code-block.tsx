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
    <div className="not-prose group relative my-6 rounded-xl overflow-hidden bg-[#141414] border border-white/[0.06]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="text-xs text-white/40 font-mono">
          {isTerminal ? "terminal" : language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all",
            "bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06]",
            "text-white/50 hover:text-white/80",
            copied && "text-emerald-400",
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto p-4 text-[13px] leading-relaxed bg-[#0a0a0a]",
          "[&::-webkit-scrollbar]:h-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-white/10",
        )}
      >
        <code className="text-white/80">{children}</code>
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const n = node as { props?: { children?: React.ReactNode } };
    return extractText(n.props?.children);
  }
  return "";
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-white/[0.08] border border-white/[0.06] px-1.5 py-0.5 text-[13px] font-medium text-white/80">
      {children}
    </code>
  );
}
