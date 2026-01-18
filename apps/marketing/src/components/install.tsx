"use client";

import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

const installCommand =
  "curl -fsSL https://github.com/elitan/frost/raw/main/install.sh | bash";

export function Install() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section id="install" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl font-bold text-center mb-8"
        >
          Install in seconds
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="relative bg-card border border-border rounded-xl p-4 font-mono text-sm"
        >
          <code className="text-muted-foreground break-all">
            {installCommand}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-border rounded-lg transition-colors"
            aria-label="Copy to clipboard"
          >
            {copied ? (
              <Check size={18} className="text-green-500" />
            ) : (
              <Copy size={18} className="text-muted-foreground" />
            )}
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-center text-muted-foreground mt-6"
        >
          See the{" "}
          <a
            href="https://github.com/elitan/frost#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            documentation
          </a>{" "}
          for detailed setup instructions.
        </motion.p>
      </div>
    </section>
  );
}
