"use client";

import { motion } from "framer-motion";
import { FileCode, Github, Terminal } from "lucide-react";

const roadmapItems = [
  {
    icon: FileCode,
    title: "frost.yaml",
    description: "Config your AI can write. Drop it in your repo, done.",
    status: "coming soon",
    code: `# frost.yaml
port: 3000
health_check:
  path: /health
resources:
  memory: 512m`,
  },
  {
    icon: Terminal,
    title: "CLI",
    description: "Commands agents understand. Deploy from any terminal.",
    status: "coming soon",
    code: `$ frost deploy
✓ Building image...
✓ Deploying container...
✓ Health check passed
→ https://app.example.com`,
  },
];

export function RoadmapSection() {
  return (
    <section className="py-24 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Roadmap
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Coming soon</h2>
          <p className="text-muted-foreground">
            Making Frost even more AI-native.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {roadmapItems.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                      <item.icon className="text-accent" size={20} />
                    </div>
                    <span className="font-semibold text-lg">{item.title}</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
                    {item.status}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {item.description}
                </p>
              </div>
              <div className="bg-neutral-950 p-4">
                <pre className="font-mono text-xs text-neutral-400 overflow-x-auto">
                  {item.code}
                </pre>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8"
        >
          <a
            href="https://github.com/elitan/frost"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github size={16} />
            Follow development on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
