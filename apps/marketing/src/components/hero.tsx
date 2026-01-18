"use client";

import { motion } from "framer-motion";
import { Github } from "lucide-react";
import { FrostLogo } from "./frost-logo";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.15), transparent)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex flex-col items-center text-center"
      >
        <FrostLogo size={100} className="mb-8" />

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
          Deploy Docker apps. Simply.
        </h1>

        <p className="text-xl text-muted-foreground max-w-lg mb-10">
          Open source Railway alternative. One server, one command.
        </p>

        <div className="flex gap-4">
          <a
            href="#install"
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
          >
            Get Started
          </a>
          <a
            href="https://github.com/elitan/frost"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-border rounded-lg font-medium hover:bg-card transition-colors flex items-center gap-2"
          >
            <Github size={20} />
            GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}
