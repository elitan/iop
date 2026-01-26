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
    <motion.div
      {...fadeInUp}
      transition={{ delay }}
      className="group animated-border rounded-xl"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <div className="w-6 h-6 rounded-md bg-gradient-to-b from-white/[0.1] to-transparent border border-white/[0.08] flex items-center justify-center">
          <Icon size={12} className="text-white/70" />
        </div>
        <span className="text-xs text-white/50 font-mono">{label}</span>
      </div>

      <div className="p-5">
        <p className="text-sm text-white/50 mb-4">{description}</p>
        <div className="relative bg-[#0a0a0a] rounded-lg p-4 overflow-x-auto border border-white/[0.04]">
          <div className="flex items-start gap-3 pr-10 whitespace-nowrap">
            <span className="text-white/40 font-mono">{prompt}</span>
            <code className="font-mono text-sm text-white/80">{command}</code>
          </div>

          <button
            type="button"
            onClick={onCopy}
            className="absolute right-3 top-3 p-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg transition-all hover:scale-105 border border-white/[0.08]"
            aria-label="Copy to clipboard"
          >
            {copied ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Copy size={14} className="text-white/50" />
            )}
          </button>
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
      <div className="absolute inset-0 bg-gradient-radial from-white/[0.02] to-transparent opacity-50 pointer-events-none" />

      <div className="max-w-2xl mx-auto relative">
        <motion.div {...fadeInUp} className="text-center mb-16">
          <span className="text-sm uppercase tracking-widest text-muted-foreground mb-4 block">
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
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <span className="text-xs text-white/30 uppercase tracking-widest">
              or
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
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
