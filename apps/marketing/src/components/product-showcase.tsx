"use client";

import { motion } from "framer-motion";
import { Check, Rocket, Terminal } from "lucide-react";

export function ProductShowcase() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            How it works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            From push to <span className="text-accent">production</span>
          </h2>
          <p className="text-muted-foreground">
            Watch your code go live in real-time
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="grid md:grid-cols-2 gap-6"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
              <Terminal size={14} className="text-neutral-500" />
              <span className="text-sm text-neutral-400">Terminal</span>
            </div>
            <div className="p-4 font-mono text-sm space-y-2">
              <div className="text-neutral-500">$ git push origin main</div>
              <div className="text-neutral-400">
                Enumerating objects: 5, done.
              </div>
              <div className="text-neutral-400">
                Counting objects: 100% (5/5), done.
              </div>
              <div className="text-neutral-400">
                Writing objects: 100% (3/3), 312 bytes
              </div>
              <div className="text-green-400">To github.com:user/app.git</div>
              <div className="text-green-400">
                {" "}
                a3f8c2d..b7e4f1a main → main
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket size={14} className="text-accent" />
                <span className="text-sm">Frost</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                Deployed
              </span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: "Webhook received", time: "0s" },
                { label: "Image built", time: "28s" },
                { label: "Container deployed", time: "32s" },
                { label: "Health check passed", time: "35s" },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check size={12} className="text-green-400" />
                  </div>
                  <span className="text-sm">{step.label}</span>
                  <span className="text-xs text-neutral-500 ml-auto">
                    {step.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
