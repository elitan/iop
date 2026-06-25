export interface ServiceIconDefinition {
  icon: string;
  keywords?: string[];
  imagePatterns?: string[];
  dark?: boolean;
  customUrl?: string;
}

export const FALLBACK_SERVICE_ICON_URL =
  "https://cdn.simpleicons.org/docker/666666";

export const SERVICE_ICON_DEFINITIONS: ServiceIconDefinition[] = [
  { icon: "nextdotjs", imagePatterns: ["next"], dark: true },
  { icon: "nuxtdotjs", imagePatterns: ["nuxt"] },
  { icon: "remix", imagePatterns: ["remix"] },
  { icon: "astro", imagePatterns: ["astro"] },
  { icon: "svelte", imagePatterns: ["svelte"] },
  { icon: "angular", imagePatterns: ["angular"] },
  { icon: "vuedotjs", imagePatterns: ["vue"] },
  { icon: "react", imagePatterns: ["react"] },
  { icon: "express", imagePatterns: ["express"] },
  { icon: "fastify", imagePatterns: ["fastify"] },
  { icon: "hono", imagePatterns: ["hono"] },
  { icon: "django", imagePatterns: ["django"] },
  { icon: "flask", imagePatterns: ["flask"] },
  { icon: "fastapi", imagePatterns: ["fastapi"] },
  { icon: "rubyonrails", imagePatterns: ["rails"] },
  { icon: "laravel", imagePatterns: ["laravel"] },
  { icon: "spring", imagePatterns: ["spring"] },

  { icon: "nodedotjs", keywords: ["node"], imagePatterns: ["node"] },
  { icon: "bun", imagePatterns: ["bun"] },
  { icon: "deno", imagePatterns: ["deno"] },
  { icon: "python", keywords: ["python"], imagePatterns: ["python"] },
  { icon: "go", imagePatterns: ["golang"] },
  { icon: "rust", imagePatterns: ["rust"] },
  { icon: "ruby", imagePatterns: ["ruby"] },
  { icon: "php", imagePatterns: ["php"] },
  { icon: "openjdk", imagePatterns: ["openjdk"] },
  { icon: "dotnet", imagePatterns: ["dotnet"] },

  {
    icon: "postgresql",
    keywords: ["postgres", "pg"],
    imagePatterns: ["postgres"],
  },
  { icon: "mysql", keywords: ["mysql"], imagePatterns: ["mysql"] },
  { icon: "mariadb", keywords: ["mariadb"], imagePatterns: ["mariadb"] },
  { icon: "mongodb", keywords: ["mongo"], imagePatterns: ["mongo"] },
  { icon: "redis", keywords: ["redis"], imagePatterns: ["redis"] },
  { icon: "nginx", keywords: ["nginx"], imagePatterns: ["nginx"] },
  { icon: "caddy", imagePatterns: ["caddy"] },
  { icon: "rabbitmq", keywords: ["rabbitmq"], imagePatterns: ["rabbitmq"] },
  {
    icon: "elasticsearch",
    keywords: ["elasticsearch", "elastic"],
    imagePatterns: ["elasticsearch"],
  },
  { icon: "minio", keywords: ["minio"], imagePatterns: ["minio"] },
  {
    icon: "garage",
    keywords: ["garage", "dxflrs/garage"],
    imagePatterns: ["garage"],
    customUrl: "https://garagehq.deuxfleurs.fr/images/garage-logo.svg",
  },
  {
    icon: "clickhouse",
    keywords: ["clickhouse"],
    imagePatterns: ["clickhouse"],
  },

  {
    icon: "meilisearch",
    keywords: ["meilisearch", "meili"],
    imagePatterns: ["meilisearch"],
  },
  {
    icon: "pocketbase",
    keywords: ["pocketbase"],
    imagePatterns: ["pocketbase"],
  },
  { icon: "grafana", keywords: ["grafana"], imagePatterns: ["grafana"] },
  { icon: "ghost", keywords: ["ghost"], imagePatterns: ["ghost"], dark: true },
  { icon: "strapi", keywords: ["strapi"], imagePatterns: ["strapi"] },
  { icon: "wordpress", keywords: ["wordpress"], imagePatterns: ["wordpress"] },
  { icon: "n8n", keywords: ["n8n"], imagePatterns: ["n8n"] },
  { icon: "hasura", keywords: ["hasura"], imagePatterns: ["hasura"] },
  { icon: "umami", keywords: ["umami"], imagePatterns: ["umami"], dark: true },
  {
    icon: "plausibleanalytics",
    keywords: ["plausible"],
    imagePatterns: ["plausible"],
  },
];

const SERVICE_ICON_BY_ICON = new Map(
  SERVICE_ICON_DEFINITIONS.map(function toIconEntry(definition) {
    return [definition.icon, definition];
  }),
);

function includesAny(value: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (value.includes(pattern)) {
      return true;
    }
  }

  return false;
}

function valuesIncludeAny(values: string[], patterns: string[]): boolean {
  for (const value of values) {
    if (includesAny(value, patterns)) {
      return true;
    }
  }

  return false;
}

export function getServiceIconUrl(icon: string): string {
  const definition = SERVICE_ICON_BY_ICON.get(icon);
  if (definition?.customUrl) {
    return definition.customUrl;
  }

  const color = definition?.dark ? "/ffffff" : "";
  return `https://cdn.simpleicons.org/${icon}${color}`;
}

export function isRegisteredServiceIcon(icon: string): boolean {
  return SERVICE_ICON_BY_ICON.has(icon);
}

export function detectServiceIconFromKeywords(values: string[]): string | null {
  const normalizedValues = values.map(function normalizeValue(value) {
    return value.toLowerCase();
  });

  for (const definition of SERVICE_ICON_DEFINITIONS) {
    const keywords = definition.keywords ?? [];
    if (valuesIncludeAny(normalizedValues, keywords)) {
      return definition.icon;
    }
  }

  return null;
}

export function detectServiceIconFromImage(imageUrl: string): string | null {
  const lower = imageUrl.toLowerCase();

  for (const definition of SERVICE_ICON_DEFINITIONS) {
    const imagePatterns = definition.imagePatterns ?? [];
    if (includesAny(lower, imagePatterns)) {
      return definition.icon;
    }
  }

  return null;
}
