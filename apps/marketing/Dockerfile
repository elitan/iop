FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY apps/app/package.json ./apps/app/
COPY apps/marketing/package.json ./apps/marketing/
RUN bun install

FROM base AS openapi-gen
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/app/node_modules ./apps/app/node_modules
COPY apps/app/src/contracts ./apps/app/src/contracts
COPY apps/app/src/lib/db-schemas.ts ./apps/app/src/lib/db-schemas.ts
COPY apps/app/scripts/generate-openapi.ts ./apps/app/scripts/
COPY apps/app/tsconfig.json ./apps/app/
WORKDIR /app/apps/app
RUN bun run scripts/generate-openapi.ts /tmp/openapi.json

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/marketing/node_modules ./apps/marketing/node_modules
COPY apps/marketing ./apps/marketing
COPY install.sh INSTALL.md ./
COPY --from=openapi-gen /tmp/openapi.json ./apps/marketing/public/openapi.json
WORKDIR /app/apps/marketing
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
COPY --from=builder /app/apps/marketing/.next/standalone ./
COPY --from=builder /app/apps/marketing/.next/static ./apps/marketing/.next/static
COPY --from=builder /app/apps/marketing/public ./apps/marketing/public
EXPOSE 3000
CMD ["bun", "run", "apps/marketing/server.js"]
