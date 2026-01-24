interface ServiceLike {
  name: string;
  icon?: string | null;
  imageUrl?: string | null;
}

const KEYWORD_ICONS: Array<{ keywords: string[]; icon: string }> = [
  { keywords: ["postgres", "pg"], icon: "postgresql" },
  { keywords: ["redis"], icon: "redis" },
  { keywords: ["mysql"], icon: "mysql" },
  { keywords: ["mongo"], icon: "mongodb" },
  { keywords: ["mariadb"], icon: "mariadb" },
  { keywords: ["nginx"], icon: "nginx" },
  { keywords: ["node"], icon: "nodedotjs" },
  { keywords: ["python"], icon: "python" },
  { keywords: ["rabbitmq"], icon: "rabbitmq" },
  { keywords: ["elasticsearch", "elastic"], icon: "elasticsearch" },
  { keywords: ["minio"], icon: "minio" },
  { keywords: ["meilisearch", "meili"], icon: "meilisearch" },
  { keywords: ["pocketbase"], icon: "pocketbase" },
  { keywords: ["grafana"], icon: "grafana" },
  { keywords: ["ghost"], icon: "ghost" },
  { keywords: ["strapi"], icon: "strapi" },
  { keywords: ["wordpress"], icon: "wordpress" },
  { keywords: ["n8n"], icon: "n8n" },
  { keywords: ["hasura"], icon: "hasura" },
  { keywords: ["umami"], icon: "umami" },
  { keywords: ["plausible"], icon: "plausibleanalytics" },
  { keywords: ["clickhouse"], icon: "clickhouse" },
];

const DARK_ICONS = new Set(["ghost", "umami", "nextdotjs"]);

function getIconUrl(icon: string): string {
  const color = DARK_ICONS.has(icon) ? "/ffffff" : "";
  return `https://cdn.simpleicons.org/${icon}${color}`;
}

export const FALLBACK_ICON = "https://cdn.simpleicons.org/docker/666666";

export function getServiceIcon(service: ServiceLike): string | null {
  if (service.icon) {
    return getIconUrl(service.icon);
  }

  const imageUrl = service.imageUrl?.toLowerCase() ?? "";
  const name = service.name.toLowerCase();

  for (const { keywords, icon } of KEYWORD_ICONS) {
    if (keywords.some((kw) => imageUrl.includes(kw) || name.includes(kw))) {
      return getIconUrl(icon);
    }
  }

  return null;
}
