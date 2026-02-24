"use client";

import { motion } from "framer-motion";

export function Hero() {
  const demoUrl =
    process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.frost.build";
  const demoAppUrl = demoUrl.endsWith("/") ? demoUrl.slice(0, -1) : demoUrl;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden pt-28">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 flex w-[90%] max-w-[1400px] flex-col items-start text-left"
      >
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]"
        >
          Open Source Alternative to
          <br />
          <span className="text-foreground">
            Vercel, Netlify, Railway and Render.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-lg text-muted-foreground mb-8 max-w-2xl text-left"
        >
          Build, deploy, and run from one open-source platform.
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="relative z-10 mt-8 w-[90%] max-w-[1400px]"
      >
        <iframe
          src={demoAppUrl}
          title="Live demo"
          loading="lazy"
          className="h-[70vh] w-full rounded-lg border border-border bg-white"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.9 }}
        className="relative z-10 mt-4 flex w-[90%] max-w-[1400px] justify-center"
      >
        <a
          href={demoAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3 font-medium text-background transition-all hover:bg-white/90"
        >
          Open demo in new tab
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="relative z-10 mt-8 w-[90%] max-w-[1400px] pb-2"
      >
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-80" />
      </motion.div>
    </section>
  );
}
