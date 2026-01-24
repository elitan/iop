interface ServiceLike {
  name: string;
  imageUrl?: string | null;
}

const KNOWN_LOGOS: Array<{ keywords: string[]; logo: string }> = [
  {
    keywords: ["postgres", "pg"],
    logo: "https://www.postgresql.org/media/img/about/press/elephant.png",
  },
  { keywords: ["redis"], logo: "https://cdn.simpleicons.org/redis/DC382D" },
  { keywords: ["mysql"], logo: "https://cdn.simpleicons.org/mysql/4479A1" },
  { keywords: ["mongo"], logo: "https://cdn.simpleicons.org/mongodb/47A248" },
  { keywords: ["mariadb"], logo: "https://cdn.simpleicons.org/mariadb/003545" },
  { keywords: ["nginx"], logo: "https://cdn.simpleicons.org/nginx/009639" },
  { keywords: ["node"], logo: "https://cdn.simpleicons.org/nodedotjs/339933" },
  { keywords: ["python"], logo: "https://cdn.simpleicons.org/python/3776AB" },
  {
    keywords: ["rabbitmq"],
    logo: "https://cdn.simpleicons.org/rabbitmq/FF6600",
  },
  {
    keywords: ["elasticsearch", "elastic"],
    logo: "https://cdn.simpleicons.org/elasticsearch/005571",
  },
  { keywords: ["minio"], logo: "https://cdn.simpleicons.org/minio/C72E49" },
];

export function getKnownServiceLogo(service: ServiceLike): string | null {
  const imageUrl = service.imageUrl?.toLowerCase() || "";
  const name = service.name.toLowerCase();

  for (const { keywords, logo } of KNOWN_LOGOS) {
    if (keywords.some((kw) => imageUrl.includes(kw) || name.includes(kw))) {
      return logo;
    }
  }

  return null;
}
