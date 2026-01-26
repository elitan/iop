"use client";

import { motion } from "framer-motion";
import {
  Activity,
  GitBranch,
  Globe,
  Key,
  Lock,
  RotateCcw,
  Settings,
  Zap,
} from "lucide-react";
import { IconBox } from "./icon-box";

const features = [
  {
    icon: Lock,
    title: "Automatic SSL",
    description: "Let's Encrypt certificates on every domain. Auto-renewed.",
  },
  {
    icon: GitBranch,
    title: "GitHub Integration",
    description: "Connect repo, push to deploy. Webhooks handle the rest.",
  },
  {
    icon: Zap,
    title: "Preview Environments",
    description: "Every PR gets its own deployment. Test before merge.",
  },
  {
    icon: RotateCcw,
    title: "Instant Rollbacks",
    description: "One click to revert. Full deployment history.",
  },
  {
    icon: Activity,
    title: "Health Checks",
    description: "Custom endpoints, configurable timeouts. Traffic waits.",
  },
  {
    icon: Globe,
    title: "Custom Domains",
    description: "Multiple domains per service. Redirects supported.",
  },
  {
    icon: Settings,
    title: "Resource Limits",
    description: "Set memory and CPU limits. Keep services in check.",
  },
  {
    icon: Key,
    title: "API Access",
    description: "Full REST API. Create API keys for CI/CD pipelines.",
  },
];

export function WhatYouGet() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm uppercase tracking-widest text-muted-foreground mb-4 block">
            Included
          </span>
          <h2 className="text-3xl md:text-4xl font-bold">
            Everything you need to ship
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group animated-border p-5"
            >
              <IconBox icon={feature.icon} className="mb-4" />
              <h3 className="font-semibold mb-1.5 text-sm text-white/90">
                {feature.title}
              </h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
