"use client";

import { motion } from "framer-motion";
import {
  Box,
  Database,
  GitPullRequest,
  Layers,
  Lock,
  Server,
} from "lucide-react";
import { IconBox } from "./icon-box";

const deployables = [
  {
    icon: Box,
    title: "Any Docker Container",
    description: "If it has a Dockerfile, Frost runs it.",
  },
  {
    icon: Database,
    title: "Databases",
    description: "Postgres, MySQL, MongoDB, Redis. One-click templates.",
  },
  {
    icon: Layers,
    title: "Multi-Service Projects",
    description: "Frontend, API, workers. All connected via Docker network.",
  },
  {
    icon: GitPullRequest,
    title: "PR Previews",
    description: "Automatic deployments for every pull request.",
  },
  {
    icon: Lock,
    title: "Private Images",
    description: "Pull from GHCR, Docker Hub, or custom registries.",
  },
  {
    icon: Server,
    title: "Long-Running Jobs",
    description: "Workers, queues, background processes. No timeout limits.",
  },
];

export function DeployAnything() {
  return (
    <section className="pt-24 pb-8 px-6 relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(var(--color-accent-rgb),0.04), transparent)",
        }}
      />

      <div className="max-w-4xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Flexible
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Deploy anything
          </h2>
          <p className="text-muted-foreground">
            Docker-native. No vendor lock-in. Your code, your way.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
          {deployables.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-4"
            >
              <IconBox icon={item.icon} size="md" className="shrink-0" />
              <div>
                <h3 className="font-medium mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
