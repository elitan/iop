import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { db } from "./db";

const execAsync = promisify(exec);

const MAX_STORAGE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface ContainerStats {
  containerId: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  serviceId: string | null;
}

export interface SystemStats {
  cpuPercent: number;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  diskUsed: number;
  diskTotal: number;
  diskPercent: number;
}

export interface MonitoringSnapshot {
  timestamp: number;
  system: SystemStats;
  containers: ContainerStats[];
}

export interface MetricsHistoryPoint {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryBytes?: number;
  diskPercent?: number;
  containerId?: string;
  serviceId?: string;
}

export interface MetricsHistory {
  system: MetricsHistoryPoint[];
  containers: Record<string, MetricsHistoryPoint[]>;
}

let lastCpuInfo: { idle: number; total: number } | null = null;

function getCpuPercent(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }

  if (!lastCpuInfo) {
    lastCpuInfo = { idle, total };
    return 0;
  }

  const idleDiff = idle - lastCpuInfo.idle;
  const totalDiff = total - lastCpuInfo.total;
  lastCpuInfo = { idle, total };

  if (totalDiff === 0) return 0;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100 * 10) / 10;
}

async function getMemoryAvailable(): Promise<number> {
  if (process.platform !== "linux") {
    return os.freemem();
  }

  try {
    const meminfo = await fs.promises.readFile("/proc/meminfo", "utf-8");
    const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (match) {
      return parseInt(match[1], 10) * 1024;
    }
  } catch {}

  return os.freemem();
}

export async function getSystemStats(): Promise<SystemStats> {
  const cpuPercent = getCpuPercent();
  const cpuCores = os.cpus().length;
  const memoryTotal = os.totalmem();
  const memoryAvailable = await getMemoryAvailable();
  const memoryUsed = memoryTotal - memoryAvailable;
  const memoryPercent = Math.round((memoryUsed / memoryTotal) * 100 * 10) / 10;

  let diskUsed = 0;
  let diskTotal = 0;
  let diskPercent = 0;

  try {
    const { stdout } = await execAsync("df -k / | tail -1");
    const parts = stdout.trim().split(/\s+/);
    diskTotal = parseInt(parts[1], 10) * 1024;
    diskUsed = parseInt(parts[2], 10) * 1024;
    diskPercent = Math.round((diskUsed / diskTotal) * 100 * 10) / 10;
  } catch {
    // ignore disk errors
  }

  return {
    cpuPercent,
    cpuCores,
    memoryUsed,
    memoryTotal,
    memoryPercent,
    diskUsed,
    diskTotal,
    diskPercent,
  };
}

function parseBytes(str: string): number {
  const match = str.match(/^([\d.]+)([KMGT]?i?B)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 * 1024,
    MIB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    GIB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
    TIB: 1024 * 1024 * 1024 * 1024,
  };
  return Math.round(num * (multipliers[unit] || 1));
}

export async function getContainerStats(): Promise<ContainerStats[]> {
  try {
    const { stdout: containerIds } = await execAsync(
      `docker ps --filter "label=frost.managed=true" --format '{{.ID}}'`,
    );

    if (!containerIds.trim()) return [];

    const ids = containerIds.trim().split("\n").join(" ");
    const { stdout } = await execAsync(
      `docker stats --no-stream --format '{{json .}}' ${ids}`,
    );

    if (!stdout.trim()) return [];

    const containers: ContainerStats[] = [];

    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      try {
        const data = JSON.parse(line);
        const [memUsage, memLimit] = (data.MemUsage || "0B / 0B").split(" / ");
        const [netRx, netTx] = (data.NetIO || "0B / 0B").split(" / ");

        let serviceId: string | null = null;
        try {
          const { stdout: labels } = await execAsync(
            `docker inspect --format '{{index .Config.Labels "frost.service.id"}}' ${data.ID}`,
          );
          serviceId = labels.trim() || null;
        } catch {
          // ignore
        }

        containers.push({
          containerId: data.ID || data.Container,
          name: data.Name,
          cpuPercent: parseFloat(data.CPUPerc) || 0,
          memoryUsage: parseBytes(memUsage),
          memoryLimit: parseBytes(memLimit),
          memoryPercent: parseFloat(data.MemPerc) || 0,
          networkRx: parseBytes(netRx),
          networkTx: parseBytes(netTx),
          serviceId,
        });
      } catch {
        // skip malformed lines
      }
    }

    return containers;
  } catch {
    return [];
  }
}

export async function getMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const [system, containers] = await Promise.all([
    getSystemStats(),
    getContainerStats(),
  ]);

  return {
    timestamp: Date.now(),
    system,
    containers,
  };
}

export async function saveMetrics(snapshot: MonitoringSnapshot): Promise<void> {
  const { timestamp, system, containers } = snapshot;

  await db
    .insertInto("metrics")
    .values({
      timestamp,
      type: "system",
      containerId: null,
      serviceId: null,
      cpuPercent: system.cpuPercent,
      memoryPercent: system.memoryPercent,
      memoryBytes: system.memoryUsed,
      networkRx: null,
      networkTx: null,
      diskPercent: system.diskPercent,
    })
    .execute();

  for (const container of containers) {
    await db
      .insertInto("metrics")
      .values({
        timestamp,
        type: "container",
        containerId: container.containerId,
        serviceId: container.serviceId,
        cpuPercent: container.cpuPercent,
        memoryPercent: container.memoryPercent,
        memoryBytes: container.memoryUsage,
        networkRx: container.networkRx,
        networkTx: container.networkTx,
        diskPercent: null,
      })
      .execute();
  }
}

const RANGE_MS: Record<string, number> = {
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};

export async function getMetricsHistory(
  range: string,
  type: string = "all",
  serviceId?: string,
): Promise<MetricsHistory> {
  const rangeMs = RANGE_MS[range] || RANGE_MS["1h"];
  const since = Date.now() - rangeMs;

  let query = db
    .selectFrom("metrics")
    .selectAll()
    .where("timestamp", ">=", since)
    .orderBy("timestamp", "asc");

  if (type === "system") {
    query = query.where("type", "=", "system");
  } else if (type === "container") {
    query = query.where("type", "=", "container");
  }

  if (serviceId) {
    query = query.where("serviceId", "=", serviceId);
  }

  const rows = await query.execute();

  const system: MetricsHistoryPoint[] = [];
  const containers: Record<string, MetricsHistoryPoint[]> = {};

  for (const row of rows) {
    if (row.type === "system") {
      system.push({
        timestamp: row.timestamp,
        cpuPercent: row.cpuPercent,
        memoryPercent: row.memoryPercent,
        diskPercent: row.diskPercent ?? undefined,
      });
    } else if (row.type === "container" && row.containerId) {
      const key = serviceId && row.serviceId ? row.serviceId : row.containerId;
      if (!containers[key]) {
        containers[key] = [];
      }
      containers[key].push({
        timestamp: row.timestamp,
        cpuPercent: row.cpuPercent,
        memoryPercent: row.memoryPercent,
        memoryBytes: row.memoryBytes ?? undefined,
        containerId: row.containerId,
        serviceId: row.serviceId ?? undefined,
      });
    }
  }

  return { system, containers };
}

export async function getMetricsStorageSize(): Promise<number> {
  try {
    const result = await db
      .selectFrom("metrics")
      .select(db.fn.count("id").as("count"))
      .executeTakeFirst();
    const count = Number(result?.count || 0);
    return count * 150; // ~150 bytes per row estimate
  } catch {
    return 0;
  }
}

export async function pruneOldMetrics(): Promise<number> {
  const size = await getMetricsStorageSize();
  if (size <= MAX_STORAGE_BYTES) return 0;

  const targetSize = MAX_STORAGE_BYTES * 0.8; // prune to 80%
  const rowsToDelete = Math.ceil((size - targetSize) / 150);

  const oldestRows = await db
    .selectFrom("metrics")
    .select("id")
    .orderBy("timestamp", "asc")
    .limit(rowsToDelete)
    .execute();

  if (oldestRows.length === 0) return 0;

  const ids = oldestRows.map((r) => r.id);
  await db.deleteFrom("metrics").where("id", "in", ids).execute();

  return ids.length;
}
