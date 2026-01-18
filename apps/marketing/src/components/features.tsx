"use client";

import { motion } from "framer-motion";
import { Box, GitBranch, Lock } from "lucide-react";

const features = [
  {
    icon: GitBranch,
    title: "Git push. Done.",
    description: "Connect repo, auto-build from Dockerfile",
  },
  {
    icon: Lock,
    title: "SSL included",
    description: "Custom domains + automatic Let's Encrypt",
  },
  {
    icon: Box,
    title: "No Kubernetes",
    description: "One server, Docker under the hood",
  },
];

export function Features() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-6 bg-card rounded-xl border border-border"
            >
              <feature.icon className="text-accent mb-4" size={28} />
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
