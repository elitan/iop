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
];

export const FALLBACK_ICON = "https://cdn.simpleicons.org/docker/666666";

export function getServiceIcon(service: ServiceLike): string | null {
  if (service.icon) {
    return `https://cdn.simpleicons.org/${service.icon}`;
  }

  const imageUrl = service.imageUrl?.toLowerCase() ?? "";
  const name = service.name.toLowerCase();

  for (const { keywords, icon } of KEYWORD_ICONS) {
    if (keywords.some((kw) => imageUrl.includes(kw) || name.includes(kw))) {
      return `https://cdn.simpleicons.org/${icon}`;
    }
  }

  return null;
}
