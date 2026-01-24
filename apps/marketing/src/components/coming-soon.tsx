"use client";

import { motion } from "framer-motion";
import { FileCode, GitBranch, HardDrive, Terminal } from "lucide-react";

const upcoming = [
  {
    name: "S3 Storage",
    description: "Built-in object storage for your apps",
    icon: HardDrive,
  },
  {
    name: "Postgres Branching",
    description: "Branch databases like code",
    icon: GitBranch,
  },
  {
    name: "CLI",
    description: "Deploy and manage from your terminal",
    icon: Terminal,
  },
  {
    name: "YAML Config",
    description: "Infrastructure as code, version controlled",
    icon: FileCode,
  },
];

export function ComingSoon() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="text-sm uppercase tracking-widest text-muted-foreground mb-2 block">
            Coming Soon
          </span>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4">
          {upcoming.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30"
            >
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <item.icon className="text-accent" size={14} />
                </div>
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-8 text-xs text-muted-foreground"
        >
          Follow{" "}
          <a
            href="https://github.com/elitan/frost"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            @elitan/frost
          </a>{" "}
          on GitHub to stay updated
        </motion.p>
      </div>
    </section>
  );
}
