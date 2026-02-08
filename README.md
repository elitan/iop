# Frost

**Get your app online, for the AI coding era.**

Open source · Self-hosted · No usage fees

---

## The Problem

AI lets you build apps in hours. Getting them online still takes forever.

- 47-step deployment guides
- YAML configs AI hallucinates
- IAM policies that take hours
- Cryptic errors, impossible to debug

Frost fixes that.

## Install

**With AI agent** — give your agent: `https://frost.build/install.md`

**Manual** — run on your server:

```bash
curl -fsSL https://frost.build/install.sh | sudo bash
```

Need a server? See [INSTALL.md](INSTALL.md) for AI-assisted VPS provisioning.

## Features

**AI-native by design**

- Simple config AI writes perfectly
- Clear errors, actionable feedback
- No K8s complexity to hallucinate
- Just Docker. Predictable.

**Everything you need**

- Git push → deployed
- Automatic SSL (Let's Encrypt)
- Custom domains
- GitHub webhooks
- PR preview environments
- Instant rollbacks
- Health checks
- Resource limits
- Full REST API

## Deploy Anything

Docker-native. If it has a Dockerfile, Frost runs it.

- **Web apps** — Next.js, Rails, Django, Go, etc.
- **Databases** — Postgres, MySQL, Redis, MongoDB
- **Multi-service projects** — frontend, API, workers on shared Docker network
- **Private images** — pull from GHCR, Docker Hub, custom registries
- **Long-running jobs** — workers, queues, background processes

## Stack

- Next.js + Bun
- SQLite + Kysely
- Tailwind + shadcn/ui
- Docker

## Development

```bash
bun install
bun run dev
bun run e2e:local
bun run e2e:smoke
bun run e2e:changed
```

Open http://localhost:3000

## Requirements

- VPS or server with Docker
- Ubuntu 20.04+ recommended

## License

MIT
