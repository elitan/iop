"use client";

import { motion } from "framer-motion";
import { Check, Infinity as InfinityIcon, X } from "lucide-react";

const unlimited = ["Projects", "Requests", "Builds"];

const usageBasedDownsides = [
  "Request limits",
  "Build minute caps",
  "Bandwidth overage fees",
  "Per-seat pricing",
];

const frostBenefits = [
  "Unlimited requests",
  "Unlimited builds",
  "20 TB bandwidth included",
  "2 vCPU \u00B7 4 GB RAM \u00B7 40 GB SSD",
];

export function PricingSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Unlimited everything.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
            No request limits. No build minutes. No per-seat pricing.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-6 mb-12">
          {unlimited.map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2"
            >
              <InfinityIcon className="text-white/40" size={18} />
              <span className="text-white/80">{item}</span>
            </motion.div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl bg-neutral-900/50 border border-red-500/20 p-6"
          >
            <div className="text-sm text-red-400/70 uppercase tracking-wide mb-4">
              Usage-based platforms
            </div>
            <div className="text-3xl font-bold text-white/60 mb-4">
              $50–200+
              <span className="text-lg font-normal text-white/30">/mo</span>
            </div>
            <ul className="space-y-2 text-sm text-white/40">
              {usageBasedDownsides.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <X size={14} className="text-red-400/50" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="animated-border p-6"
          >
            <div className="text-sm text-emerald-400/80 uppercase tracking-wide mb-4">
              Frost + Hetzner CX22
            </div>
            <div className="text-3xl font-bold text-white mb-4">
              $4<span className="text-lg font-normal text-white/50">/mo</span>
            </div>
            <ul className="space-y-2 text-sm text-white/70">
              {frostBenefits.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
