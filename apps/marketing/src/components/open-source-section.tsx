"use client";

import { motion } from "framer-motion";
import { Github, Server, Shield } from "lucide-react";

export function OpenSourceSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-b from-card to-card/50 border border-border rounded-2xl p-8 md:p-12 text-center"
        >
          <div className="flex justify-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Github className="text-accent" size={24} />
            </div>
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Server className="text-accent" size={24} />
            </div>
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Shield className="text-accent" size={24} />
            </div>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your server. Your data. Your rules.
          </h2>

          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Frost is fully open source and runs on your own infrastructure. No
            vendor lock-in. No usage limits. No surprise bills. Just Docker on a
            server you control.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/elitan/frost"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium bg-neutral-800 hover:bg-neutral-700 transition-colors border border-neutral-700"
            >
              <Github size={18} />
              View on GitHub
            </a>
            <a
              href="#install"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#000",
              }}
            >
              Get Started
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
