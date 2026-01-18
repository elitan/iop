"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, Globe } from "lucide-react";

export function SSLSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at top, rgba(var(--color-accent-rgb), 0.08), transparent 60%)",
            }}
          />

          <div className="relative p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <span className="inline-block text-xs uppercase tracking-widest text-accent mb-4 px-3 py-1 rounded-full border border-accent/20 bg-accent/5">
                  Automatic SSL
                </span>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  HTTPS everywhere.
                  <br />
                  Zero configuration.
                </h2>
                <p className="text-muted-foreground mb-6">
                  Every domain gets automatic Let's Encrypt certificates.
                  Renewed automatically. No DNS verification needed.
                </p>
                <span className="text-accent text-sm flex items-center gap-1">
                  Zero config required <ArrowRight size={14} />
                </span>
              </div>

              <div className="space-y-3">
                {[
                  "app.example.com",
                  "api.example.com",
                  "admin.example.com",
                ].map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={16} className="text-accent" />
                      <span className="font-mono text-sm">{domain}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <Check size={14} />
                      SSL Active
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
