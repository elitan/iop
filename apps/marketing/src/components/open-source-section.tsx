"use client";

import { motion } from "framer-motion";
import { Github, Server, Shield } from "lucide-react";

export function OpenSourceSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-2xl p-px overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-transparent to-transparent" />
          <div className="absolute inset-0 rounded-2xl border border-white/[0.06]" />

          <div className="relative rounded-2xl bg-[#141414] p-8 md:p-12">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent rounded-2xl" />

            <div className="relative text-center">
              <div className="flex justify-center gap-3 mb-8">
                {[
                  { Icon: Github, name: "github" },
                  { Icon: Server, name: "server" },
                  { Icon: Shield, name: "shield" },
                ].map(({ Icon, name }, i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.1 }}
                    className="relative w-12 h-12 rounded-xl bg-gradient-to-b from-white/[0.06] to-transparent border border-white/[0.08] flex items-center justify-center"
                  >
                    <Icon className="text-white/60" size={22} />
                  </motion.div>
                ))}
              </div>

              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
                Open source runtime. No platform markup.
              </h2>

              <p className="text-white/50 mb-10 max-w-2xl mx-auto leading-relaxed">
                Your apps run on your server. Frost gives your AI coding agent a
                clean deploy workflow.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://github.com/elitan/frost"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium bg-white/[0.05] hover:bg-white/[0.08] transition-colors border border-white/[0.1] text-white/80 hover:text-white"
                >
                  <Github size={18} />
                  View on GitHub
                </a>
                <a
                  href="#install"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium bg-white text-[#0a0a0a] hover:bg-white/90 transition-colors"
                >
                  Get Started
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
