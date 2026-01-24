FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/marketing/package.json ./apps/marketing/
RUN bun install --filter @frost/marketing

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/marketing/node_modules ./apps/marketing/node_modules
COPY apps/marketing ./apps/marketing
COPY install.sh INSTALL.md ./
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
