# Frost

Simple deployment platform. Docker-only, single-user.

See also: `CLAUDE.local.md` for local/personal instructions (gitignored).

## Concepts

**Project** - container for related services. Has project-level env vars inherited by all services.

**Service** - deployable workload within a project. Two deploy types:
- `repo`: builds from git repo (repo_url, branch, dockerfile_path)
- `image`: pulls pre-built image (image_url)

**PORT handling** (like Cloud Run): Apps should listen on `PORT` env var (default 8080). For images that ignore PORT and have a hardcoded port, set `container_port` on the service to match.

Services communicate via Docker network using service name as hostname.

**Domain** - custom domain attached to a service. Multiple domains per service supported. Types:
- `proxy`: routes traffic to service
- `redirect`: 301/307 redirect to another domain

**Deployment** - immutable record of a service deployment. Status: pending → cloning/pulling → building → deploying → running/failed. Tracks container_id, host_port, build_log.

**Settings** - key-value store for domain, email (Let's Encrypt), SSL config.

## Test VPS
- IP: 65.21.180.49
- Domain: frost.j4labs.se
- Test service domain: testapp.frost.j4labs.se (A record points to VPS)
- SSH: `ssh root@65.21.180.49`
- **Always enable "Use staging certificates" when setting up SSL** to avoid Let's Encrypt rate limits

Fresh install (after VPS rebuild):
```bash
ssh root@65.21.180.49 "curl -fsSL https://raw.githubusercontent.com/elitan/frost/main/install.sh | sudo bash"
```
Then open http://65.21.180.49 in browser to complete setup.

Update existing install:
```bash
ssh root@65.21.180.49 "/opt/frost/update.sh"
```

Dev deploy (push local changes to test VPS):
```bash
./dev-deploy.sh
```

## Stack
- Bun + Next.js 16
- SQLite + Kysely
- Tailwind + shadcn/ui

## Commands
```bash
bun run dev          # start dev server
bun run build        # production build
bun run db:gen       # regenerate db types (run after schema changes)
```

## E2E Tests

Run locally (start `bun run dev` first):
```bash
./apps/app/scripts/e2e-local.sh <api-key>           # run all tests
./apps/app/scripts/e2e-local.sh <api-key> 2         # batch size 2 (fewer parallel tests)

# run single test
SERVER_IP=localhost API_KEY=<key> E2E_LOCAL=1 FROST_DATA_DIR=./apps/app/data \
  ./apps/app/scripts/e2e/group-01-basic.sh
```

Run against remote VPS:
```bash
./apps/app/scripts/e2e-test.sh <ip> <api-key>
```

E2E tests run automatically via GitHub Actions on PRs.

## Test locally
```bash
# create project using local fixture
curl -X POST localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"test","repo_url":"./test/fixtures/simple-node","port":3000}'

# deploy
curl -X POST localhost:3000/api/projects/{id}/deploy

# check status
curl localhost:3000/api/deployments/{id}
```

## Structure
- `src/lib/db.ts` - database (Kysely + better-sqlite3)
- `src/lib/docker.ts` - docker build/run/stop
- `src/lib/deployer.ts` - deploy orchestration
- `src/app/api/` - REST API routes
- `src/proxy.ts` - auth middleware; add public endpoints here (e.g. `/api/github/webhook`)
- `schema/` - SQL migrations
- `test/fixtures/` - test apps with Dockerfiles

## Database
SQLite at `data/frost.db`. Auto-migrates on startup.

Tables: `projects`, `services`, `deployments`, `domains`, `settings`

Types in `src/lib/db-types.ts` are auto-generated. Never modify manually.

**CamelCasePlugin**: Kysely uses CamelCasePlugin to auto-convert between camelCase (TypeScript) and snake_case (database). In TypeScript code, use camelCase (`projectId`, `createdAt`). Raw SQL queries must use snake_case (`project_id`, `created_at`).

## Deploy flow
1. Clone repo (repo type) or pull image (image type)
2. Docker build with merged env vars (project + service)
3. Create project network if needed
4. Run new container on network (hostname = service name)
5. Health check
6. Stop previous deployment

## Conventions
- Use static imports (not dynamic `await import`) - we run on VPS only, no edge runtime
- When planning features, consider if docs need updating
- New service settings must work across API, UI, and frost.yaml config file
- Never use non-null assertions (`!`). Handle undefined properly or throw explicit errors.
- Breaking backward compatibility is OK - early development phase
- Use bun, not node/npm/pnpm
- Image names: `frost-{serviceid}:{sha}`
- Container names: `frost-{serviceid}`
- Network names: `frost-net-{projectid}`
- Host ports: 10000-20000 range
- Page-specific components in `_components/` folder next to page.tsx
- Shared components in `src/components/`
- When unsure about design decisions, do web searches to see how Vercel/Cloud Run/Railway handle it
- React Query mutations: use `await queryClient.refetchQueries()` in onSuccess, not `invalidateQueries()` (invalidate marks stale but doesn't guarantee immediate refetch)
- Settings requiring redeploy (env vars, resource limits, health checks): use toast with "Redeploy required" description and Redeploy action button
- Confirmations: use `<ConfirmDialog>` from `@/components/confirm-dialog`

## Git Conventions

**Pre-commit checks** - run before committing:
```bash
bun run typecheck && bun run lint
```

**Auto-fix lint issues**:
```bash
bun run lint:fix
```

**Commit messages** - use conventional commits format:
- `feat: add dark mode` - new feature
- `fix: resolve login redirect` - bug fix
- `docs: update readme` - documentation
- `refactor: simplify deploy logic` - code restructure
- `chore: update deps` - maintenance

Keep messages short (<50 chars title). Body optional for context.

**Releases** - use GitHub Actions workflow (bumps package.json, creates tag, generates notes):
```bash
gh workflow run release.yml -f version=patch  # or minor, major
```
**Never create releases manually** - always use the workflow above.

**Choosing version bump** - check commits since last release with `git log --oneline`:
- `patch`: bug fixes only (`fix:` commits)
- `minor`: new features, backward compatible (`feat:` commits)
- `major`: breaking changes (rare, requires explicit mention in commits)
