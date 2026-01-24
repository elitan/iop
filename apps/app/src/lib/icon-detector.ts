import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const IMAGE_PATTERNS: Array<{ pattern: string; icon: string }> = [
  { pattern: "next", icon: "nextdotjs" },
  { pattern: "nuxt", icon: "nuxtdotjs" },
  { pattern: "remix", icon: "remix" },
  { pattern: "astro", icon: "astro" },
  { pattern: "svelte", icon: "svelte" },
  { pattern: "angular", icon: "angular" },
  { pattern: "vue", icon: "vuedotjs" },
  { pattern: "react", icon: "react" },
  { pattern: "express", icon: "express" },
  { pattern: "fastify", icon: "fastify" },
  { pattern: "hono", icon: "hono" },
  { pattern: "django", icon: "django" },
  { pattern: "flask", icon: "flask" },
  { pattern: "fastapi", icon: "fastapi" },
  { pattern: "rails", icon: "rubyonrails" },
  { pattern: "laravel", icon: "laravel" },
  { pattern: "spring", icon: "spring" },

  { pattern: "node", icon: "nodedotjs" },
  { pattern: "bun", icon: "bun" },
  { pattern: "deno", icon: "deno" },
  { pattern: "python", icon: "python" },
  { pattern: "golang", icon: "go" },
  { pattern: "rust", icon: "rust" },
  { pattern: "ruby", icon: "ruby" },
  { pattern: "php", icon: "php" },
  { pattern: "openjdk", icon: "openjdk" },
  { pattern: "dotnet", icon: "dotnet" },

  { pattern: "postgres", icon: "postgresql" },
  { pattern: "mysql", icon: "mysql" },
  { pattern: "mariadb", icon: "mariadb" },
  { pattern: "mongo", icon: "mongodb" },
  { pattern: "redis", icon: "redis" },
  { pattern: "nginx", icon: "nginx" },
  { pattern: "caddy", icon: "caddy" },
  { pattern: "rabbitmq", icon: "rabbitmq" },
  { pattern: "elasticsearch", icon: "elasticsearch" },
  { pattern: "minio", icon: "minio" },
  { pattern: "clickhouse", icon: "clickhouse" },

  { pattern: "meilisearch", icon: "meilisearch" },
  { pattern: "pocketbase", icon: "pocketbase" },
  { pattern: "grafana", icon: "grafana" },
  { pattern: "ghost", icon: "ghost" },
  { pattern: "strapi", icon: "strapi" },
  { pattern: "wordpress", icon: "wordpress" },
  { pattern: "n8n", icon: "n8n" },
  { pattern: "hasura", icon: "hasura" },
  { pattern: "umami", icon: "umami" },
  { pattern: "plausible", icon: "plausible" },
];

function detectFromDockerfile(content: string): string | null {
  const fromMatch = content.toLowerCase().match(/^from\s+([^\s:]+)/m);
  if (!fromMatch) return null;

  const baseImage = fromMatch[1];
  for (const { pattern, icon } of IMAGE_PATTERNS) {
    if (baseImage.includes(pattern)) return icon;
  }
  return null;
}

function detectFromPackageJson(content: object): string | null {
  const pkg = content as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps.next) return "nextdotjs";
  if (deps.nuxt) return "nuxtdotjs";
  if (deps["@remix-run/node"] || deps["@remix-run/react"]) return "remix";
  if (deps.astro) return "astro";
  if (deps.svelte) return "svelte";
  if (deps["@angular/core"]) return "angular";
  if (deps.vue) return "vuedotjs";
  if (deps.react) return "react";
  if (deps.express) return "express";
  if (deps.fastify) return "fastify";
  if (deps.hono) return "hono";

  return "nodedotjs";
}

function tryParseJson(content: string): object | null {
  try {
    return JSON.parse(content) as object;
  } catch {
    return null;
  }
}

export function detectIcon(
  repoPath: string,
  dockerfilePath = "Dockerfile",
): string | null {
  const dockerfileDir = dirname(join(repoPath, dockerfilePath));
  const packageJsonPath = join(dockerfileDir, "package.json");
  if (existsSync(packageJsonPath)) {
    const content = tryParseJson(readFileSync(packageJsonPath, "utf-8"));
    if (content) {
      const detected = detectFromPackageJson(content);
      if (detected) return detected;
    }
  }

  const fullDockerfilePath = join(repoPath, dockerfilePath);
  if (existsSync(fullDockerfilePath)) {
    try {
      const content = readFileSync(fullDockerfilePath, "utf-8");
      const detected = detectFromDockerfile(content);
      if (detected) return detected;
    } catch {}
  }

  return null;
}

export function detectIconFromImage(imageUrl: string): string | null {
  const lower = imageUrl.toLowerCase();
  for (const { pattern, icon } of IMAGE_PATTERNS) {
    if (lower.includes(pattern)) return icon;
  }
  return null;
}
