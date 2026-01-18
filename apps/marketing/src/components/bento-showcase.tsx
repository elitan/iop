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
  ArrowUpRight,
} from "lucide-react";

function StatCard({
  value,
  label,
  icon: Icon,
}: {
  value: string;
  label: string;
  icon: typeof Box;
}) {
  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-xl p-6 flex flex-col justify-between h-full">
      <Icon size={20} className="text-accent mb-4" />
      <div>
        <div className="text-4xl font-bold mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function DeployChart() {
  const bars = [65, 45, 80, 55, 90, 40, 70];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-xl p-6 h-full">
      <div className="text-sm text-muted-foreground mb-6">Deploys this week</div>
      <div className="flex items-end justify-between gap-2 h-32">
        {bars.map((height, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{
                height: `${height}%`,
                background:
                  i === 4
                    ? "linear-gradient(to top, var(--color-accent), rgba(var(--color-accent-rgb), 0.5))"
                    : "#1e1e26",
              }}
            />
            <span className="text-xs text-muted-foreground">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceStatus() {
  const services = [
    { name: "api", status: "running", cpu: "12%" },
    { name: "web", status: "running", cpu: "8%" },
    { name: "worker", status: "running", cpu: "45%" },
    { name: "redis", status: "running", cpu: "3%" },
  ];

  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">Services</div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          All healthy
        </span>
      </div>
      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-mono">{service.name}</span>
            </div>
            <span className="text-muted-foreground text-xs">{service.cpu}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroCard() {
  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-xl p-8 h-full relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at top right, rgba(var(--color-accent-rgb), 0.15), transparent 70%)",
        }}
      />
      <div className="relative">
        <span className="inline-block text-xs uppercase tracking-widest text-accent mb-4 px-3 py-1 rounded-full border border-accent/20 bg-accent/5">
          Dashboard
        </span>
        <h3 className="text-2xl md:text-3xl font-bold mb-3">
          Your Server,
          <br />
          Your Control
        </h3>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
          Monitor deployments, manage services, and scale with confidence. All
          from a single dashboard.
        </p>
      </div>
    </div>
  );
}

function ActivityFeed() {
  const activities = [
    { action: "Deployed", service: "api", time: "2m ago", success: true },
    { action: "Scaled", service: "worker", time: "15m ago", success: true },
    { action: "SSL renewed", service: "web", time: "1h ago", success: true },
  ];

  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-xl p-6 h-full">
      <div className="text-sm text-muted-foreground mb-4">Recent Activity</div>
      <div className="space-y-4">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center mt-0.5">
              <Check size={12} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                {activity.action}{" "}
                <span className="text-accent font-mono">{activity.service}</span>
              </div>
              <div className="text-xs text-muted-foreground">{activity.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UptimeGraph() {
  return (
    <div className="bg-[#0a0a0c] border border-[#1e1e26] rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">Uptime</div>
        <span className="text-emerald-400 text-sm font-medium">99.98%</span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-8 rounded-sm"
            style={{
              background: i === 12 ? "#fbbf24" : "rgba(52, 211, 153, 0.6)",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function LayoutA() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="col-span-2 row-span-2">
        <HeroCard />
      </div>
      <StatCard value="847" label="Deployments" icon={Zap} />
      <StatCard value="99.9%" label="Uptime" icon={Activity} />
      <div className="col-span-2">
        <DeployChart />
      </div>
      <div className="col-span-2 md:col-span-2">
        <ServiceStatus />
      </div>
      <div className="col-span-2">
        <UptimeGraph />
      </div>
    </div>
  );
}

function LayoutB() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <HeroCard />
      </div>
      <div>
        <ServiceStatus />
      </div>
      <div>
        <StatCard value="12" label="Active Services" icon={Server} />
      </div>
      <div>
        <DeployChart />
      </div>
      <div>
        <ActivityFeed />
      </div>
      <div className="md:col-span-3">
        <UptimeGraph />
      </div>
    </div>
  );
}

function LayoutC() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      <div className="col-span-2">
        <StatCard value="24" label="Services Running" icon={Server} />
      </div>
      <div className="col-span-2">
        <StatCard value="1.2k" label="Deploys this month" icon={Zap} />
      </div>
      <div className="col-span-2">
        <StatCard value="8" label="Custom Domains" icon={Globe} />
      </div>
      <div className="col-span-2 md:col-span-3 row-span-2">
        <HeroCard />
      </div>
      <div className="col-span-2 md:col-span-3">
        <DeployChart />
      </div>
      <div className="col-span-2 md:col-span-3">
        <ServiceStatus />
      </div>
    </div>
  );
}

const layouts = [
  { id: "A", label: "Grid", component: LayoutA },
  { id: "B", label: "Cards", component: LayoutB },
  { id: "C", label: "Stats", component: LayoutC },
];

export function BentoShowcase() {
  const [activeLayout, setActiveLayout] = useState("A");
  const ActiveComponent =
    layouts.find((l) => l.id === activeLayout)?.component ?? LayoutA;

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(var(--color-accent-rgb),0.05), transparent)",
        }}
      />

      <div className="max-w-6xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <span className="text-sm uppercase tracking-widest text-accent mb-4 block">
            Dashboard
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything at a glance
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Monitor your entire infrastructure from a single, powerful dashboard.
          </p>
        </motion.div>

        <div className="flex justify-center gap-2 mb-8">
          {layouts.map((layout) => (
            <button
              key={layout.id}
              type="button"
              onClick={() => setActiveLayout(layout.id)}
              className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                activeLayout === layout.id
                  ? "bg-accent text-background border-accent"
                  : "border-border text-muted-foreground hover:border-muted hover:text-foreground"
              }`}
            >
              {layout.label}
            </button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-gradient-to-b from-accent/5 to-transparent rounded-3xl blur-2xl" />
          <div className="relative bg-[#08080a] border border-[#1a1a22] rounded-2xl p-4 md:p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <ActiveComponent />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
