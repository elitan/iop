"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Check,
  ExternalLink,
  GitBranch,
  Globe,
  MoreHorizontal,
  RotateCcw,
  Terminal,
} from "lucide-react";

function StatusDot({ status }: { status: "running" | "building" | "failed" }) {
  const colors = {
    running: "bg-green-500",
    building: "bg-yellow-500 animate-pulse",
    failed: "bg-red-500",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}

export function MonitoringSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-5 gap-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2"
          >
            <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
              Monitor
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Full visibility into every service
            </h2>
            <p className="text-muted-foreground mb-6">
              Deployment status, logs, domains, and environment variables.
              Everything you need in one place.
            </p>
            <div className="space-y-3">
              {[
                { icon: Activity, label: "Real-time status" },
                { icon: Terminal, label: "Live build logs" },
                { icon: Globe, label: "Domain management" },
                { icon: RotateCcw, label: "One-click rollbacks" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <item.icon size={16} className="text-accent" />
                  {item.label}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3 relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-l from-accent/5 to-transparent rounded-2xl blur-xl" />
            <div className="relative space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-lg font-medium">
                      A
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-lg">api</span>
                        <StatusDot status="running" />
                        <span className="text-xs text-green-400">Running</span>
                      </div>
                      <span className="text-sm text-blue-400 flex items-center gap-1">
                        api.example.com
                        <ExternalLink size={12} />
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                  >
                    <MoreHorizontal size={16} className="text-neutral-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <div className="text-xs text-neutral-500 mb-2">Source</div>
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch size={14} className="text-accent" />
                    <span>elitan/my-app</span>
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    main ·{" "}
                    <span className="font-mono text-accent">a3f8c2d</span>
                  </div>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <div className="text-xs text-neutral-500 mb-2">Domains</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={12} className="text-green-400" />
                      api.example.com
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={12} className="text-green-400" />
                      api-v2.example.com
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
