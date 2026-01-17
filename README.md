# Frost

Open source Railway alternative.

## Features

- Deploy any repo with a Dockerfile
- Web UI for managing projects
- Build logs and deployment status
- Auto-assigns ports (10000-20000 range)

## Stack

- Next.js + Bun
- SQLite + Kysely
- Tailwind + shadcn/ui
- Docker

## Installation

**Need a server?** See [INSTALL.md](INSTALL.md) for AI-assisted VPS provisioning.

**Already have a server?**
```bash
curl -fsSL https://raw.githubusercontent.com/elitan/frost/main/install.sh | sudo bash
```

## Local Development

```bash
bun install
bun run dev
```

Open http://localhost:3000

## Usage

1. Create a project (provide repo URL, branch, port)
2. Click Deploy
3. Access your app at the assigned port

## API

```bash
# Create project
curl -X POST localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"myapp","repo_url":"https://github.com/user/repo","port":3000}'

# Deploy
curl -X POST localhost:3000/api/projects/{id}/deploy

# Get deployment status
curl localhost:3000/api/deployments/{id}
```

## Requirements

- Bun
- Docker

## License

MIT

