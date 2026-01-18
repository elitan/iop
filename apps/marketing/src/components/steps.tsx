"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "1",
    title: "Install",
    description: "One curl command on your VPS",
  },
  {
    number: "2",
    title: "Create",
    description: "Add project + service",
  },
  {
    number: "3",
    title: "Deploy",
    description: "Git push or click deploy",
  },
];

export function Steps() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl font-bold text-center mb-16"
        >
          How It Works
        </motion.h2>

        <div className="flex flex-col md:flex-row gap-8 md:gap-4 items-center justify-center">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="flex flex-col items-center text-center flex-1"
            >
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center text-xl font-bold mb-4">
                {step.number}
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
