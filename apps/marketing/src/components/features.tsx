"use client";

import { motion } from "framer-motion";
import { Box, GitBranch, Lock, Zap } from "lucide-react";

const features = [
  {
    icon: GitBranch,
    title: "Git Push Deploy",
    description:
      "Connect repo, push, deployed. AI generates code, you push, it's live.",
  },
  {
    icon: Lock,
    title: "Automatic SSL",
    description:
      "HTTPS on every domain. Let's Encrypt certificates. Zero config needed.",
  },
  {
    icon: Box,
    title: "Docker Native",
    description:
      "No K8s complexity for AI to hallucinate. Just Docker. Predictable.",
  },
  {
    icon: Zap,
    title: "Fast Deploys",
    description:
      "Ship as fast as AI codes. Instant rollbacks. Zero-downtime deploys.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-32 px-6 relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(var(--color-accent-rgb),0.03), transparent)",
        }}
      />

      <div className="max-w-6xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            AI-Native by Design
          </span>
          <h2 className="text-3xl md:text-4xl font-bold">
            Infrastructure AI agents understand
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative"
            >
              <div
                className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
                style={{ background: "rgba(var(--color-accent-rgb), 0.1)" }}
              />
              <div className="relative animated-border p-8 hover:bg-card-hover transition-colors h-full">
                <div className="w-12 h-12 rounded-xl bg-[#1a1a1f] border border-[#2a2a32] flex items-center justify-center mb-5 transition-all group-hover:border-accent/30 group-hover:bg-[#1f1f25]">
                  <feature.icon className="text-accent" size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3 group-hover:text-accent transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
