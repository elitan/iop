"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Box,
  Check,
  Globe,
  GitBranch,
  Zap,
  Server,
  Activity,
  Clock,
  ArrowRight,
  Terminal,
  Database,
  ChevronRight,
  ExternalLink,
  Copy,
  RotateCcw,
  Rocket,
  Plus,
  Search,
  MoreHorizontal,
} from "lucide-react";

// ============================================
// FROST UI COMPONENTS (matching real app)
// ============================================

function StatusDot({ status }: { status: "running" | "building" | "failed" | "pending" }) {
  const colors = {
    running: "bg-green-500",
    building: "bg-yellow-500 animate-pulse",
    failed: "bg-red-500",
    pending: "bg-neutral-500",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}

function FrostServiceCard({
  name,
  status,
  url,
  commit,
  time,
  type = "github",
}: {
  name: string;
  status: "running" | "building" | "failed";
  url?: string;
  commit?: string;
  time: string;
  type?: "github" | "docker";
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 hover:bg-neutral-800/50 transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-medium">
            {name[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-neutral-100">{name}</div>
            {url && (
              <div className="text-xs text-neutral-500 truncate max-w-[150px]">
                {url}
              </div>
            )}
          </div>
        </div>
        <StatusDot status={status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        {type === "github" ? (
          <GitBranch size={12} />
        ) : (
          <Box size={12} />
        )}
        <span className="truncate">{commit || "main"}</span>
        <span>·</span>
        <span>{time}</span>
      </div>
    </div>
  );
}

function FrostProjectCard({
  name,
  services,
  url,
}: {
  name: string;
  services: number;
  url?: string;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 hover:bg-neutral-800/50 transition-all cursor-pointer">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center text-sm font-medium text-accent">
          {name[0].toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-neutral-100">{name}</div>
          <div className="text-xs text-neutral-500">{services} services</div>
        </div>
      </div>
      {url && (
        <div className="text-xs text-neutral-500 flex items-center gap-1">
          <Globe size={12} />
          <span className="truncate">{url}</span>
        </div>
      )}
    </div>
  );
}

function FrostDeploymentRow({
  sha,
  status,
  time,
  current,
}: {
  sha: string;
  status: "running" | "building" | "failed";
  time: string;
  current?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
        current ? "bg-neutral-800" : "hover:bg-neutral-800/50"
      } transition-colors cursor-pointer`}
    >
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <span className="font-mono text-neutral-300">{sha}</span>
        {current && (
          <span className="text-xs px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400">
            Current
          </span>
        )}
      </div>
      <span className="text-xs text-neutral-500">{time}</span>
    </div>
  );
}

function FrostBuildLog() {
  const logs = [
    { text: "Cloning repository...", type: "info" },
    { text: "Installing dependencies...", type: "info" },
    { text: "Building application...", type: "info" },
    { text: "Build completed in 45s", type: "success" },
    { text: "Deploying to container...", type: "info" },
    { text: "Health check passed", type: "success" },
    { text: "Deployment successful!", type: "success" },
  ];

  return (
    <div className="bg-neutral-950 rounded-lg p-4 font-mono text-xs space-y-1 h-full overflow-hidden">
      {logs.map((log, i) => (
        <div
          key={i}
          className={
            log.type === "success"
              ? "text-green-400"
              : log.type === "error"
                ? "text-red-400"
                : "text-neutral-400"
          }
        >
          <span className="text-neutral-600 mr-2">[{String(i + 1).padStart(2, "0")}]</span>
          {log.text}
        </div>
      ))}
      <div className="text-neutral-600 animate-pulse">▋</div>
    </div>
  );
}

// ============================================
// VARIATION 1: Hero with Canvas Preview
// ============================================

function Variation1_HeroCanvas() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            See your infrastructure
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Visual canvas that makes your entire stack legible at a glance.
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-b from-accent/5 to-transparent rounded-3xl blur-2xl" />
          <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl p-6 overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <div className="ml-4 flex items-center gap-2 text-xs text-neutral-500">
                <span className="px-2 py-1 rounded bg-neutral-800">my-saas-app</span>
                <span className="text-neutral-600">/</span>
                <span>production</span>
              </div>
            </div>

            {/* Canvas with services */}
            <div className="relative h-80 bg-[#0a0a0c] rounded-lg border border-neutral-800">
              {/* Grid pattern */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, #333 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />

              {/* Service nodes */}
              <div className="absolute top-8 left-8">
                <FrostServiceCard
                  name="frontend"
                  status="running"
                  url="app.example.com"
                  time="2m ago"
                />
              </div>

              <div className="absolute top-8 right-8">
                <FrostServiceCard
                  name="api"
                  status="running"
                  url="api.example.com"
                  time="2m ago"
                />
              </div>

              <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                <FrostServiceCard
                  name="postgres"
                  status="running"
                  time="1h ago"
                  type="docker"
                />
              </div>

              {/* Connection lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <line
                  x1="200"
                  y1="100"
                  x2="400"
                  y2="200"
                  stroke="rgba(var(--color-accent-rgb), 0.3)"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
                <line
                  x1="600"
                  y1="100"
                  x2="400"
                  y2="200"
                  stroke="rgba(var(--color-accent-rgb), 0.3)"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 2: Deploy Flow
// ============================================

function Variation2_DeployFlow() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
              Deploy
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Push to deploy.
              <br />
              <span className="text-accent">That's it.</span>
            </h2>
            <p className="text-muted-foreground mb-8">
              Connect your repo, push your code, and watch it go live. No
              complex pipelines, no YAML nightmares.
            </p>
            <ul className="space-y-4">
              {[
                "Auto-detects Dockerfile",
                "Builds in isolated containers",
                "Zero-downtime deployments",
                "Instant rollbacks",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center">
                    <Check size={12} className="text-accent" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-accent/5 to-transparent rounded-2xl blur-xl" />
            <div className="relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <StatusDot status="running" />
                  <span className="text-sm font-medium">api</span>
                </div>
                <span className="text-xs text-green-400">Deployed</span>
              </div>

              {/* Deployments list */}
              <div className="p-2 space-y-1 border-b border-neutral-800">
                <FrostDeploymentRow sha="a3f8c2d" status="running" time="2m ago" current />
                <FrostDeploymentRow sha="b7e4f1a" status="running" time="1h ago" />
                <FrostDeploymentRow sha="c9d2e3f" status="failed" time="2h ago" />
              </div>

              {/* Build log preview */}
              <div className="p-4">
                <div className="text-xs text-neutral-500 mb-2">Build Log</div>
                <FrostBuildLog />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 3: Dashboard Overview
// ============================================

function Variation3_Dashboard() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Dashboard
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            All your projects. One view.
          </h2>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-b from-accent/5 to-transparent rounded-3xl blur-2xl" />
          <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Rocket size={16} className="text-accent" />
                </div>
                <span className="font-medium">Projects</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 rounded-lg text-sm text-neutral-400">
                  <Search size={14} />
                  <span>Search...</span>
                </div>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-accent text-background rounded-lg text-sm font-medium">
                  <Plus size={14} />
                  New Project
                </button>
              </div>
            </div>

            {/* Projects grid */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FrostProjectCard name="my-saas-app" services={4} url="app.example.com" />
              <FrostProjectCard name="marketing-site" services={2} url="example.com" />
              <FrostProjectCard name="internal-tools" services={3} />
              <FrostProjectCard name="api-gateway" services={1} url="api.example.com" />
              <FrostProjectCard name="data-pipeline" services={5} />
              <div className="bg-neutral-900/50 border border-dashed border-neutral-700 rounded-lg p-4 flex items-center justify-center text-neutral-500 hover:border-accent/50 hover:text-accent transition-colors cursor-pointer">
                <Plus size={20} className="mr-2" />
                Add Project
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 4: Service Detail
// ============================================

function Variation4_ServiceDetail() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2">
            <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
              Monitor
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Full visibility into every service
            </h2>
            <p className="text-muted-foreground mb-6">
              Deployment status, logs, domains, and environment variables. Everything you need in one place.
            </p>
            <div className="space-y-3">
              {[
                { icon: Activity, label: "Real-time status" },
                { icon: Terminal, label: "Live build logs" },
                { icon: Globe, label: "Domain management" },
                { icon: RotateCcw, label: "One-click rollbacks" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <item.icon size={16} className="text-accent" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 relative">
            <div className="absolute -inset-4 bg-gradient-to-l from-accent/5 to-transparent rounded-2xl blur-xl" />
            <div className="relative space-y-4">
              {/* Service header card */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-lg font-medium">
                      A
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-lg">api</span>
                        <StatusDot status="running" />
                        <span className="text-xs text-green-400">Running</span>
                      </div>
                      <a href="#" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        api.example.com
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                  <button className="p-2 hover:bg-neutral-800 rounded-lg transition-colors">
                    <MoreHorizontal size={16} className="text-neutral-400" />
                  </button>
                </div>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <div className="text-xs text-neutral-500 mb-2">Source</div>
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch size={14} className="text-accent" />
                    <span>elitan/my-app</span>
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    main · <span className="font-mono text-accent">a3f8c2d</span>
                  </div>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                  <div className="text-xs text-neutral-500 mb-2">Domains</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={12} className="text-green-400" />
                      api.example.com
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={12} className="text-green-400" />
                      api-v2.example.com
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 5: Bento Stats Grid
// ============================================

function Variation5_BentoStats() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Built for <span className="text-accent">simplicity</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Large feature card */}
          <div className="col-span-2 row-span-2 bg-neutral-900 border border-neutral-800 rounded-xl p-8 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background:
                  "radial-gradient(ellipse at top right, rgba(var(--color-accent-rgb), 0.15), transparent 70%)",
              }}
            />
            <div className="relative">
              <Terminal size={32} className="text-accent mb-4" />
              <h3 className="text-2xl font-bold mb-2">One Command Install</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Get up and running in seconds. No complex setup, no dependencies to manage.
              </p>
              <div className="bg-neutral-950 rounded-lg p-3 font-mono text-sm text-neutral-400">
                curl -fsSL frost.sh | bash
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <Zap size={20} className="text-accent mb-3" />
            <div className="text-3xl font-bold mb-1">~30s</div>
            <div className="text-sm text-muted-foreground">Avg deploy time</div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <Server size={20} className="text-accent mb-3" />
            <div className="text-3xl font-bold mb-1">∞</div>
            <div className="text-sm text-muted-foreground">Services per project</div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <Globe size={20} className="text-accent mb-3" />
            <div className="text-3xl font-bold mb-1">Auto</div>
            <div className="text-sm text-muted-foreground">SSL certificates</div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <Database size={20} className="text-accent mb-3" />
            <div className="text-3xl font-bold mb-1">1-Click</div>
            <div className="text-sm text-muted-foreground">Database setup</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 6: Side-by-Side Comparison
// ============================================

function Variation6_Comparison() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            From push to <span className="text-accent">production</span>
          </h2>
          <p className="text-muted-foreground">Watch your code go live in real-time</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Git push side */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
              <Terminal size={14} className="text-neutral-500" />
              <span className="text-sm text-neutral-400">Terminal</span>
            </div>
            <div className="p-4 font-mono text-sm space-y-2">
              <div className="text-neutral-500">$ git push origin main</div>
              <div className="text-neutral-400">Enumerating objects: 5, done.</div>
              <div className="text-neutral-400">Counting objects: 100% (5/5), done.</div>
              <div className="text-neutral-400">Writing objects: 100% (3/3), 312 bytes</div>
              <div className="text-green-400">To github.com:user/app.git</div>
              <div className="text-green-400">   a3f8c2d..b7e4f1a  main → main</div>
            </div>
          </div>

          {/* Deployment side */}
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
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check size={12} className="text-green-400" />
                </div>
                <span className="text-sm">Webhook received</span>
                <span className="text-xs text-neutral-500 ml-auto">0s</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check size={12} className="text-green-400" />
                </div>
                <span className="text-sm">Image built</span>
                <span className="text-xs text-neutral-500 ml-auto">28s</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check size={12} className="text-green-400" />
                </div>
                <span className="text-sm">Container deployed</span>
                <span className="text-xs text-neutral-500 ml-auto">32s</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check size={12} className="text-green-400" />
                </div>
                <span className="text-sm">Health check passed</span>
                <span className="text-xs text-neutral-500 ml-auto">35s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 7: Full Width Feature
// ============================================

function Variation7_FullWidth() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
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
                  Every domain gets automatic Let's Encrypt certificates. Renewed automatically. No DNS verification needed.
                </p>
                <div className="flex items-center gap-4">
                  <a href="#" className="text-accent hover:underline text-sm flex items-center gap-1">
                    Learn more <ArrowRight size={14} />
                  </a>
                </div>
              </div>

              <div className="space-y-3">
                {["app.example.com", "api.example.com", "admin.example.com"].map((domain) => (
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
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 8: Minimal Cards
// ============================================

function Variation8_MinimalCards() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why developers choose Frost
          </h2>
        </div>

        <div className="space-y-4">
          {[
            {
              title: "Self-hosted",
              desc: "Your server, your data. Complete control over your infrastructure.",
              icon: Server,
            },
            {
              title: "Docker-native",
              desc: "If it runs in Docker, it runs on Frost. No vendor lock-in.",
              icon: Box,
            },
            {
              title: "Git-driven",
              desc: "Push to deploy. Automatic builds from your Dockerfile.",
              icon: GitBranch,
            },
            {
              title: "Open source",
              desc: "MIT licensed. Audit, fork, or contribute. It's yours.",
              icon: Rocket,
            },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group flex items-start gap-6 p-6 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 group-hover:border-accent/30 transition-colors">
                <item.icon size={24} className="text-accent" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// VARIATION 9: Stacked Cards (Railway-style)
// ============================================

function Variation9_StackedCards() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="space-y-32">
          {/* Section 1 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
                Deploy
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Deploy anything
                <br />
                without the complexity
              </h2>
              <p className="text-muted-foreground mb-6">
                Connect your repo, Frost handles the rest. Auto-config, instant deploys, no new tools to learn.
              </p>
              <a href="#" className="text-accent hover:underline text-sm flex items-center gap-1">
                Learn more <ArrowRight size={14} />
              </a>
            </div>
            <div className="relative h-80">
              {/* Stacked cards effect */}
              <div className="absolute inset-0 bg-neutral-800/50 rounded-xl transform rotate-3 translate-x-4 translate-y-4" />
              <div className="absolute inset-0 bg-neutral-800/70 rounded-xl transform rotate-1 translate-x-2 translate-y-2" />
              <div className="absolute inset-0 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-3 h-full">
                  <FrostServiceCard name="frontend" status="running" url="app.com" time="2m" />
                  <FrostServiceCard name="api" status="building" time="now" />
                  <FrostServiceCard name="worker" status="running" time="5m" />
                  <FrostServiceCard name="postgres" status="running" time="1h" type="docker" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative h-64">
              <div className="absolute inset-0 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                <div className="text-sm text-neutral-500 mb-4">Connected Services</div>
                <div className="flex items-center justify-center h-40">
                  <div className="relative">
                    {/* Central node */}
                    <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
                      <Server size={24} className="text-accent" />
                    </div>
                    {/* Connection dots */}
                    {[0, 72, 144, 216, 288].map((angle, i) => (
                      <div
                        key={i}
                        className="absolute w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                        style={{
                          transform: `rotate(${angle}deg) translateX(80px) rotate(-${angle}deg)`,
                          top: "50%",
                          left: "50%",
                          marginTop: "-20px",
                          marginLeft: "-20px",
                        }}
                      >
                        <Database size={16} className="text-neutral-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
                Network
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Private networking.
                <br />
                Zero config.
              </h2>
              <p className="text-muted-foreground mb-6">
                Services connect by name. Internal networking just works. No port mapping, no IP addresses.
              </p>
              <a href="#" className="text-accent hover:underline text-sm flex items-center gap-1">
                Learn more <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN EXPORT: All Variations
// ============================================

const variations = [
  { id: "1", label: "Deploy Flow", component: Variation2_DeployFlow },
  { id: "2", label: "Service Detail", component: Variation4_ServiceDetail },
  { id: "3", label: "Push to Prod", component: Variation6_Comparison },
  { id: "4", label: "Full Width SSL", component: Variation7_FullWidth },
];

export function SectionVariations() {
  return (
    <section className="border-t border-neutral-800">
      <div className="py-12 px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-2">Section Variations</h2>
          <p className="text-muted-foreground text-sm">
            Scroll through different layout options below
          </p>
        </div>
      </div>

      {variations.map((v, i) => (
        <div key={v.id} className="border-b border-neutral-800">
          <div className="bg-neutral-950/50 px-6 py-3 sticky top-0 z-10 backdrop-blur-sm border-b border-neutral-800">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <span className="text-sm font-medium">
                <span className="text-accent">#{v.id}</span> {v.label}
              </span>
              <span className="text-xs text-neutral-500">Variation {i + 1} of {variations.length}</span>
            </div>
          </div>
          <v.component />
        </div>
      ))}
    </section>
  );
}
