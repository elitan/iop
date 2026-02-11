"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const unlimited = [
  "Unlimited services",
  "Unlimited deploys",
  "Unlimited seats",
];

const usageBasedDownsides = [
  "Seat-based pricing",
  "Overage fees on bandwidth and builds",
  "Costs climb fast as traffic grows",
  "Surprise bill swings month to month",
  "Extra spend for team growth",
];

const frostBenefits = [
  "No per-seat tax",
  "No usage pricing layer",
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
            Vercel experience. VPS pricing.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
            Keep the fast deploy workflow. Drop the platform tax.
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
              <Check size={16} className="text-emerald-400" />
              <span className="text-white font-medium">{item}</span>
            </motion.div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl bg-red-950/25 border border-red-500/40 p-6"
          >
            <div className="text-sm text-red-400/70 uppercase tracking-wide mb-4">
              Vercel / Railway style billing
            </div>
            <div className="text-3xl font-bold text-red-200 mb-1">
              $49+
              <span className="text-lg font-normal text-red-200/70">/mo</span>
            </div>
            <div className="text-xs text-red-200/60 mb-4">
              before team and usage overages
            </div>
            <ul className="space-y-2 text-sm text-red-100/70">
              {usageBasedDownsides.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <X size={14} className="text-red-300/80" />
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
