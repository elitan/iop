"use client";

import { motion } from "framer-motion";
import { Plus, Rocket, Terminal } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Terminal,
    title: "Install",
    description: "One command on your server",
    code: "curl ... | bash",
  },
  {
    number: "02",
    icon: Plus,
    title: "Connect",
    description: "Link your repo in the UI",
    code: "github.com/you/app",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Ship",
    description: "Push code, it's live",
    code: "git push",
  },
];

export function Steps() {
  return (
    <section id="how-it-works" className="py-32 px-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-50" />

      <div className="max-w-5xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Get Started
          </span>
          <h2 className="text-3xl md:text-4xl font-bold">
            Three steps to ship
          </h2>
        </motion.div>

        <div className="relative">
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2" />

          <motion.div
            className="hidden md:block absolute top-1/2 left-0 h-px -translate-y-1/2"
            style={{
              background:
                "linear-gradient(to right, var(--color-accent), transparent)",
            }}
            initial={{ width: 0 }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
          />

          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
                className="relative flex flex-col items-center text-center group"
              >
                <div className="relative mb-6">
                  <motion.div
                    className="absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-50 transition-opacity"
                    style={{
                      background:
                        "radial-gradient(circle, var(--color-accent), transparent)",
                    }}
                  />

                  <div className="relative w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center group-hover:border-accent/50 transition-colors">
                    <step.icon
                      className="text-accent transition-transform group-hover:scale-110"
                      size={32}
                    />
                  </div>

                  <span className="absolute -top-2 -right-2 text-xs font-mono text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
                    {step.number}
                  </span>
                </div>

                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground mb-4">{step.description}</p>

                <span
                  className="font-mono text-sm px-3 py-1 rounded border"
                  style={{
                    color: "var(--color-accent)",
                    background: "rgba(var(--color-accent-rgb), 0.05)",
                    borderColor: "rgba(var(--color-accent-rgb), 0.1)",
                  }}
                >
                  {step.code}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
