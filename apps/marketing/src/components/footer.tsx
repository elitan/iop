"use client";

import { motion } from "framer-motion";
import { FrostLogo } from "./frost-logo";
import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <FrostLogo size={28} />
              <span className="font-semibold text-lg">Frost</span>
            </div>
            <p className="text-sm text-muted-foreground text-center md:text-left">
              Deploy Docker apps. Simply.
            </p>
          </div>

          <div className="flex items-center gap-8">
            <a
              href="https://github.com/elitan/frost"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github size={18} />
              <span className="text-sm">GitHub</span>
            </a>
            <a
              href="https://github.com/elitan/frost#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Documentation
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted"
        >
          <span>Open source under MIT License</span>
          <span>Made with precision</span>
        </motion.div>
      </div>
    </footer>
  );
}
