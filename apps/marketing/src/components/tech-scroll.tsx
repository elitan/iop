"use client";

import { motion } from "framer-motion";

const technologies = [
  { name: "PostgreSQL", slug: "postgresql", color: "4169E1" },
  { name: "Supabase", slug: "supabase", color: "3FCF8E" },
  { name: "Next.js", slug: "nextdotjs", color: "ffffff" },
  { name: "Redis", slug: "redis", color: "FF4438" },
  { name: "TypeScript", slug: "typescript", color: "3178C6" },
  { name: "Meilisearch", slug: "meilisearch", color: "FF5CAA" },
  { name: "Python", slug: "python", color: "3776AB" },
  { name: "n8n", slug: "n8n", color: "EA4B71" },
  { name: "Go", slug: "go", color: "00ADD8" },
  { name: "Ghost", slug: "ghost", color: "ffffff" },
  { name: "Hono", slug: "hono", color: "E36002" },
  { name: "Strapi", slug: "strapi", color: "4945FF" },
  { name: "Bun", slug: "bun", color: "ffffff" },
  { name: "Grafana", slug: "grafana", color: "F46800" },
  { name: "MinIO", slug: "minio", color: "C72E49" },
  { name: "Appwrite", slug: "appwrite", color: "FD366E" },
  { name: "PocketBase", slug: "pocketbase", color: "B8DBE4" },
  { name: "MongoDB", slug: "mongodb", color: "47A248" },
  { name: "Umami", slug: "umami", color: "ffffff" },
  { name: "Plausible", slug: "plausibleanalytics", color: "5850EC" },
  { name: "Hasura", slug: "hasura", color: "1EB4D4" },
  { name: "Nhost", slug: "nhost", color: "1EB4D4" },
  { name: "WordPress", slug: "wordpress", color: "21759B" },
];

function TechItem({
  name,
  slug,
  color,
}: {
  name: string;
  slug: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 mx-2 rounded-lg bg-neutral-900/50 border border-neutral-800/50 shrink-0">
      <img
        src={`https://cdn.simpleicons.org/${slug}/${color}`}
        alt={name}
        width={20}
        height={20}
        className="opacity-70"
      />
      <span className="text-sm text-muted-foreground">{name}</span>
    </div>
  );
}

export function TechScroll() {
  return (
    <section className="pt-4 pb-12 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="w-full"
      >
        <div className="flex animate-scroll-reverse">
          {[...technologies, ...technologies].map((tech, i) => (
            <TechItem key={`${tech.slug}-${i}`} {...tech} />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
