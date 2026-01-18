"use client";

import { motion } from "framer-motion";
import { Box, Check, Globe, GitBranch, Play, Circle } from "lucide-react";

function ProjectCard() {
  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-lg p-4 w-full max-w-xs">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#1a1a1f] border border-[#2a2a32] flex items-center justify-center">
          <Box size={20} className="text-accent" />
        </div>
        <div>
          <div className="font-medium text-sm">my-saas-app</div>
          <div className="text-xs text-muted-foreground">3 services</div>
        </div>
      </div>
      <div className="space-y-2">
        {["api", "web", "worker"].map((name, i) => (
          <div
            key={name}
            className="flex items-center justify-between text-xs bg-[#0d0d12] rounded px-3 py-2"
          >
            <span className="text-muted-foreground">{name}</span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Circle size={6} fill="currentColor" />
              Running
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeploymentTimeline() {
  const steps = [
    { label: "Cloning", done: true },
    { label: "Building", done: true },
    { label: "Deploying", done: true },
    { label: "Running", done: true, active: true },
  ];

  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-lg p-4 w-full max-w-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium">Deployment</div>
        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Success
        </span>
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                step.active
                  ? "bg-accent text-background"
                  : step.done
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-[#1a1a1f] text-muted"
              }`}
            >
              {step.done && <Check size={12} />}
            </div>
            <span
              className={`text-xs ${step.active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {step.label}
            </span>
            {step.active && (
              <span className="text-xs text-muted-foreground ml-auto">
                Live
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DomainCard() {
  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={14} className="text-accent" />
        <span className="text-sm font-medium">Domains</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs bg-[#0d0d12] rounded px-3 py-2">
          <span className="text-foreground">app.example.com</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <Check size={12} />
            SSL
          </span>
        </div>
        <div className="flex items-center justify-between text-xs bg-[#0d0d12] rounded px-3 py-2">
          <span className="text-foreground">api.example.com</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <Check size={12} />
            SSL
          </span>
        </div>
      </div>
    </div>
  );
}

function GitCard() {
  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={14} className="text-accent" />
        <span className="text-sm font-medium">Source</span>
      </div>
      <div className="text-xs space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Repository</span>
          <span className="text-foreground">elitan/my-app</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Branch</span>
          <span className="text-foreground">main</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Commit</span>
          <span className="font-mono text-accent">a3f8c2d</span>
        </div>
      </div>
    </div>
  );
}

export function Showcase() {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-32">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Manage projects
              <br />
              <span className="text-accent">with clarity</span>
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              See all your services at a glance. Monitor deployments, check
              status, and manage everything from one dashboard.
            </p>
            <ul className="space-y-3">
              {[
                "Project-based organization",
                "Real-time deployment status",
                "Service health monitoring",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <div className="w-1 h-1 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-accent/5 to-transparent rounded-2xl blur-2xl" />
            <div className="relative flex gap-4 justify-center">
              <ProjectCard />
              <div className="hidden sm:block">
                <DeploymentTimeline />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative order-2 lg:order-1"
          >
            <div className="absolute -inset-4 bg-gradient-to-l from-accent/5 to-transparent rounded-2xl blur-2xl" />
            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto lg:mx-0">
              <DomainCard />
              <GitCard />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="order-1 lg:order-2"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Git deploys &
              <br />
              <span className="text-accent">automatic SSL</span>
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Push to deploy. Custom domains with automatic Let's Encrypt
              certificates. No manual configuration needed.
            </p>
            <ul className="space-y-3">
              {[
                "Push-to-deploy workflow",
                "Auto-renewing SSL certificates",
                "Multiple domains per service",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <div className="w-1 h-1 rounded-full bg-accent" />
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
