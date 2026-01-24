"use client";

import { motion } from "framer-motion";

const traditionalCloud = [
  "47-step deployment guides",
  "YAML configs AI hallucinates",
  "IAM policies that take hours",
  "Cryptic errors, impossible to debug",
];

const frostBenefits = [
  "Git push, it's live",
  "Simple config AI writes perfectly",
  "No IAM, no policies, no roles",
  "Clear errors, actionable feedback",
];

export function TheShift() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            AI lets you build an app in hours.
            <br />
            <span className="text-red-400/70">
              Getting it online still takes forever.
            </span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            That&apos;s backwards. Frost fixes it.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-neutral-900 border border-red-500/20 rounded-xl p-6"
          >
            <div className="text-sm text-red-400 mb-4 uppercase tracking-wide">
              Traditional Cloud
            </div>
            <ul className="space-y-3 text-sm text-neutral-400">
              {traditionalCloud.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-red-400">x</span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-neutral-900 border border-accent/30 rounded-xl p-6"
          >
            <div className="text-sm text-accent mb-4 uppercase tracking-wide">
              Frost
            </div>
            <ul className="space-y-3 text-sm text-neutral-400">
              {frostBenefits.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-accent">-&gt;</span>
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
