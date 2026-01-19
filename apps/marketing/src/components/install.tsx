"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Bot, Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

const installCommand = "curl -fsSL https://frost.build/install.sh | sudo bash";
const agentUrl = "https://frost.build/install.md";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

interface InstallCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
  command: string;
  prompt: string;
  copied: boolean;
  onCopy: () => void;
  delay: number;
}

function InstallCard({
  icon: Icon,
  label,
  description,
  command,
  prompt,
  copied,
  onCopy,
  delay,
}: InstallCardProps): React.ReactElement {
  return (
    <motion.div {...fadeInUp} transition={{ delay }} className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 via-secondary/20 to-accent/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card-hover">
          <Icon size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono">
            {label}
          </span>
        </div>

        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          <div className="relative bg-background/50 rounded-lg p-4 overflow-x-auto">
            <div className="flex items-start gap-3 pr-10 whitespace-nowrap">
              <span className="text-accent font-mono">{prompt}</span>
              <code className="font-mono text-sm text-foreground/90">
                {command}
              </code>
            </div>

            <button
              type="button"
              onClick={onCopy}
              className="absolute right-3 top-3 p-2 bg-card-hover hover:bg-border rounded-lg transition-all hover:scale-105 border border-transparent hover:border-border"
              aria-label="Copy to clipboard"
            >
              {copied ? (
                <Check size={16} className="text-emerald-400" />
              ) : (
                <Copy size={16} className="text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);

  function copy(text: string): void {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return [copied, copy];
}

export function Install(): React.ReactElement {
  const [copiedAgent, copyAgent] = useCopy();
  const [copiedManual, copyManual] = useCopy();

  return (
    <section id="install" className="py-32 px-6 relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(var(--color-accent-rgb),0.08), transparent)",
        }}
      />

      <div className="max-w-2xl mx-auto relative">
        <motion.div {...fadeInUp} className="text-center mb-16">
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Get Started
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Deploy in seconds
          </h2>
        </motion.div>

        <div className="flex flex-col gap-6">
          <InstallCard
            icon={Bot}
            label="Agent"
            description="Give this to your AI agent"
            command={agentUrl}
            prompt="→"
            copied={copiedAgent}
            onCopy={() => copyAgent(agentUrl)}
            delay={0.1}
          />

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-4 py-2"
          >
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <span className="text-xs text-muted uppercase tracking-widest">
              or
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          </motion.div>

          <InstallCard
            icon={Terminal}
            label="Manual"
            description="Run on your server"
            command={installCommand}
            prompt="$"
            copied={copiedManual}
            onCopy={() => copyManual(installCommand)}
            delay={0.2}
          />
        </div>
      </div>
    </section>
  );
}
