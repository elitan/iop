import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectServiceIconFromImage } from "./service-icons";

function detectFromDockerfile(content: string): string | null {
  const fromMatch = content.toLowerCase().match(/^from\s+([^\s:]+)/m);
  if (!fromMatch) return null;

  const baseImage = fromMatch[1];
  return detectServiceIconFromImage(baseImage);
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
  return detectServiceIconFromImage(imageUrl);
}
