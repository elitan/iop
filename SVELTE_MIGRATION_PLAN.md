# Svelte Migration Plan

This document outlines the plan to migrate Frost from Next.js 16 + React to SvelteKit + Svelte 5.

## Current Stack

- **Framework:** Next.js 16 (App Router)
- **UI Library:** React 19
- **State Management:** TanStack Query (React Query)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **API:** oRPC with REST-like client wrapper
- **Database:** SQLite + Kysely
- **Runtime:** Bun

## Target Stack

- **Framework:** SvelteKit 2
- **UI Library:** Svelte 5 (with runes)
- **State Management:** TanStack Query (Svelte Query) + Svelte stores
- **Styling:** Tailwind CSS 4 + shadcn-svelte
- **API:** Keep existing oRPC backend, adapt client
- **Database:** SQLite + Kysely (unchanged)
- **Runtime:** Bun

---

## Phase 1: Project Setup & Infrastructure

### 1.1 Initialize SvelteKit Project

Create a new SvelteKit project alongside the existing Next.js app:

```bash
bunx sv create svelte-app
# Select: SvelteKit minimal, TypeScript, Tailwind CSS
```

Configuration choices:
- TypeScript with strict mode
- Tailwind CSS 4
- No additional integrations initially

### 1.2 Configure Build & Development

**Files to create/modify:**

- `svelte.config.js` - SvelteKit configuration
- `vite.config.ts` - Vite configuration (SvelteKit uses Vite)
- `tsconfig.json` - TypeScript configuration for Svelte

**Key configurations:**

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-node';

export default {
  kit: {
    adapter: adapter(),
    alias: {
      '$lib': 'src/lib',
      '$components': 'src/components'
    }
  }
};
```

### 1.3 Port Tailwind Configuration

**Current:** `tailwind.config.js` + `globals.css`

**Migration:**
1. Copy CSS variables from `globals.css` to new `app.css`
2. Adapt Tailwind config for SvelteKit paths
3. Keep dark mode only design (no theme toggle)

### 1.4 Install Dependencies

**Direct replacements:**
| React | Svelte |
|-------|--------|
| `@tanstack/react-query` | `@tanstack/svelte-query` |
| `framer-motion` | `svelte/transition` + `svelte/animate` |
| `lucide-react` | `lucide-svelte` |
| `sonner` | `svelte-sonner` |
| `@radix-ui/*` | `bits-ui` (shadcn-svelte uses this) |

**New dependencies:**
```bash
bun add @tanstack/svelte-query bits-ui lucide-svelte svelte-sonner
bun add -D @sveltejs/kit @sveltejs/adapter-node svelte
```

---

## Phase 2: Core Infrastructure Migration

### 2.1 API Client Adaptation

**Current:** `src/lib/api.ts` (425 lines)

The API client is framework-agnostic (uses fetch). Minimal changes needed:

1. Keep the core `api` object structure
2. Update error handling to work with Svelte stores/runes
3. Export types for Svelte components

**File:** `src/lib/api.ts` - Keep mostly as-is

### 2.2 Authentication & Middleware

**Current:** `src/proxy.ts` (Next.js middleware)

**SvelteKit equivalent:** `src/hooks.server.ts`

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

const PUBLIC_ROUTES = ['/login', '/api/auth', '/api/health', '/api/github/webhook'];

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Check if public route
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return resolve(event);
  }

  // Validate session/API key
  const session = event.cookies.get('frost_session');
  const apiKey = event.request.headers.get('x-frost-token');

  if (!session && !apiKey) {
    if (pathname.startsWith('/api/')) {
      return new Response('Unauthorized', { status: 401 });
    }
    throw redirect(302, '/login');
  }

  // Validate token...
  return resolve(event);
};
```

### 2.3 Query Client Setup

**Current:** `src/components/query-provider.tsx`

**SvelteKit equivalent:** Layout with QueryClientProvider

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import '../app.css';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        refetchOnWindowFocus: true
      }
    }
  });
</script>

<QueryClientProvider client={queryClient}>
  <slot />
  <Toaster />
</QueryClientProvider>
```

### 2.4 Database & Server Logic

**No changes required.** The following stay the same:
- `src/lib/db.ts` - Kysely database setup
- `src/lib/db-types.ts` - Generated types
- `src/server/` - oRPC router definitions
- `schema/` - SQL migrations

---

## Phase 3: UI Component Migration

### 3.1 shadcn-svelte Setup

Install shadcn-svelte CLI and initialize:

```bash
bunx shadcn-svelte@latest init
```

**Components to port (10 base components):**

| shadcn/ui (React) | shadcn-svelte |
|-------------------|---------------|
| `button.tsx` | `button.svelte` |
| `card.tsx` | `card.svelte` |
| `input.tsx` | `input.svelte` |
| `label.tsx` | `label.svelte` |
| `select.tsx` | `select.svelte` |
| `switch.tsx` | `switch.svelte` |
| `badge.tsx` | `badge.svelte` |
| `separator.tsx` | `separator.svelte` |
| `skeleton.tsx` | `skeleton.svelte` |

Add via CLI:
```bash
bunx shadcn-svelte@latest add button card input label select switch badge separator skeleton
```

### 3.2 Custom Component Migration Strategy

**Shared components to migrate (in order):**

1. `status-dot.svelte` - Simple, good starting point
2. `empty-state.svelte` - Simple layout component
3. `frost-logo.svelte` - SVG component
4. `setting-card.svelte` - Layout wrapper
5. `tab-nav.svelte` - Needs Svelte transitions instead of Framer Motion
6. `breadcrumb-header.svelte` - Navigation component
7. `env-var-editor.svelte` - Complex form component

**Migration pattern for each component:**

```svelte
<!-- Example: status-dot.svelte -->
<script lang="ts">
  import { cn } from '$lib/utils';

  type Status = 'running' | 'pending' | 'failed' | 'stopped';

  interface Props {
    status: Status;
    class?: string;
  }

  let { status, class: className }: Props = $props();

  const statusColors: Record<Status, string> = {
    running: 'bg-green-500',
    pending: 'bg-yellow-500',
    failed: 'bg-red-500',
    stopped: 'bg-neutral-500'
  };
</script>

<span class={cn('h-2 w-2 rounded-full', statusColors[status], className)} />
```

### 3.3 React Hooks to Svelte Runes

**Pattern conversions:**

| React | Svelte 5 |
|-------|----------|
| `useState(initial)` | `let value = $state(initial)` |
| `useEffect(() => {}, [deps])` | `$effect(() => {})` |
| `useMemo(() => compute, [deps])` | `let computed = $derived(expression)` |
| `useCallback(fn, [deps])` | Just use regular function |
| `useRef(initial)` | `let ref = $state(initial)` or bind:this |

**React Query hooks to Svelte Query:**

```typescript
// React (current)
const { data, isLoading } = useProjects();

// Svelte 5
const projects = createQuery({
  queryKey: ['projects'],
  queryFn: () => api.projects.list()
});
// Access: $projects.data, $projects.isLoading
```

---

## Phase 4: Route Migration

### 4.1 Route Structure Mapping

| Next.js App Router | SvelteKit |
|--------------------|-----------|
| `app/page.tsx` | `routes/+page.svelte` |
| `app/layout.tsx` | `routes/+layout.svelte` |
| `app/[id]/page.tsx` | `routes/[id]/+page.svelte` |
| `app/api/route.ts` | `routes/api/+server.ts` |

### 4.2 Page Migration Order

**Priority 1 - Core functionality:**
1. `/login` - Authentication entry point
2. `/` - Home/projects list
3. `/projects/new` - Create project
4. `/projects/[id]` - Project overview

**Priority 2 - Service management:**
5. `/projects/[id]/services/new` - Create service (complex)
6. `/projects/[id]/services/[serviceId]` - Service dashboard
7. `/projects/[id]/services/[serviceId]/deployments` - Deployment history
8. `/projects/[id]/services/[serviceId]/logs` - Runtime logs

**Priority 3 - Settings:**
9. `/settings` - Main settings
10. `/settings/domain` - Domain configuration
11. `/settings/github` - GitHub integration
12. `/settings/api-keys` - API keys
13. `/settings/monitoring` - System monitoring

**Priority 4 - Service settings:**
14. All `/projects/[id]/services/[serviceId]/settings/*` routes

### 4.3 Layout Migration

**Root layout:**
```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import '../app.css';

  let { children } = $props();

  const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    {@render children()}
  </div>
  <Toaster />
</QueryClientProvider>
```

**Project layout with breadcrumbs:**
```svelte
<!-- src/routes/projects/[id]/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import BreadcrumbHeader from '$components/breadcrumb-header.svelte';

  let { children } = $props();
</script>

<BreadcrumbHeader />
{@render children()}
```

---

## Phase 5: API Route Migration

### 5.1 Keep oRPC Backend

The oRPC server can work with SvelteKit. Create a catch-all route:

```typescript
// src/routes/api/[...orpc]/+server.ts
import { router } from '$lib/server/router';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
  return router.handle(request);
};

export const POST: RequestHandler = async ({ request }) => {
  return router.handle(request);
};
```

### 5.2 Auth Routes

```typescript
// src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { password } = await request.json();
  // Validate password, create session...
  cookies.set('frost_session', token, { path: '/', httpOnly: true });
  return json({ success: true });
};
```

### 5.3 Streaming Endpoints (Logs)

SvelteKit supports streaming responses:

```typescript
// src/routes/api/deployments/[id]/logs/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const stream = new ReadableStream({
    async start(controller) {
      // Stream log lines...
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
};
```

---

## Phase 6: Complex Component Migration

### 6.1 Service Creation Form (525 lines)

Break into smaller Svelte components:
- `service-form.svelte` - Main form container
- `deploy-type-selector.svelte` - Repo vs Image selection
- `repo-selector.svelte` - GitHub repo browser
- `template-selector.svelte` - Database templates
- `env-vars-section.svelte` - Environment variables

**Key patterns:**
- Use `$state` for form fields
- Use `$derived` for computed values (e.g., form validity)
- Use `createMutation` for submit handling

### 6.2 Domains Section (586 lines)

Complex state machine for DNS/SSL verification:

```svelte
<script lang="ts">
  import { createQuery, createMutation } from '@tanstack/svelte-query';

  let verificationStatus = $state<'idle' | 'checking' | 'verified' | 'failed'>('idle');

  const verifyDns = createMutation({
    mutationFn: (domainId: string) => api.domains.verifyDns(domainId),
    onSuccess: () => {
      verificationStatus = 'verified';
    }
  });

  // Polling effect
  $effect(() => {
    if (verificationStatus === 'checking') {
      const interval = setInterval(() => {
        $verifyDns.mutate(domainId);
      }, 5000);
      return () => clearInterval(interval);
    }
  });
</script>
```

### 6.3 Monitoring Dashboard

Replace Recharts with a Svelte-compatible charting library:

**Options:**
1. **LayerChart** - Svelte-native, built on D3
2. **Chart.js** with svelte-chartjs wrapper
3. **Apache ECharts** with svelte wrapper

**Recommendation:** LayerChart for native Svelte integration

```svelte
<script lang="ts">
  import { Chart, Svg, Line, Axis } from 'layerchart';

  let { data } = $props();
</script>

<Chart {data} x="time" y="value">
  <Svg>
    <Axis placement="bottom" />
    <Axis placement="left" />
    <Line />
  </Svg>
</Chart>
```

### 6.4 Tab Navigation with Animations

Replace Framer Motion with Svelte transitions:

```svelte
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { page } from '$app/stores';

  let { tabs } = $props();

  let activeIndex = $derived(
    tabs.findIndex(tab => $page.url.pathname === tab.href)
  );
</script>

<nav class="flex gap-4 border-b border-neutral-800">
  {#each tabs as tab, i}
    <a
      href={tab.href}
      class="relative py-2 px-4"
      class:text-white={i === activeIndex}
      class:text-neutral-500={i !== activeIndex}
    >
      {tab.label}
      {#if i === activeIndex}
        <span
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
          in:fly={{ x: -20, duration: 200 }}
        />
      {/if}
    </a>
  {/each}
</nav>
```

---

## Phase 7: Data Fetching Migration

### 7.1 Query Hooks to Svelte Query

**Create query factories:**

```typescript
// src/lib/queries/projects.ts
import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
import { api } from '$lib/api';

export function projectsQuery() {
  return createQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list()
  });
}

export function projectQuery(id: string) {
  return createQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.get(id),
    refetchInterval: 2000
  });
}

export function createProjectMutation() {
  const queryClient = useQueryClient();

  return createMutation({
    mutationFn: (data: CreateProjectInput) => api.projects.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });
}
```

### 7.2 Real-time Updates

Keep polling pattern with Svelte Query:

```svelte
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';

  const stats = createQuery({
    queryKey: ['monitoring', 'stats'],
    queryFn: () => api.monitoring.getStats(),
    refetchInterval: 2000
  });
</script>

{#if $stats.isLoading}
  <Skeleton />
{:else if $stats.data}
  <MetricsDisplay data={$stats.data} />
{/if}
```

---

## Phase 8: Testing & Validation

### 8.1 E2E Tests

Update existing e2e tests to work with SvelteKit:
- Tests use HTTP API calls, should work unchanged
- UI tests (if any) need selector updates

### 8.2 Type Checking

```bash
bun run check  # svelte-check
bun run typecheck  # tsc --noEmit
```

### 8.3 Build Verification

```bash
bun run build
bun run preview
```

---

## Migration Checklist

### Infrastructure
- [ ] Initialize SvelteKit project
- [ ] Configure Vite and SvelteKit
- [ ] Port Tailwind configuration
- [ ] Install all dependencies
- [ ] Set up shadcn-svelte

### Core Systems
- [ ] Port authentication middleware to hooks.server.ts
- [ ] Set up Svelte Query provider
- [ ] Adapt API client for Svelte
- [ ] Configure routing aliases

### UI Components
- [ ] Add all shadcn-svelte base components
- [ ] Migrate status-dot
- [ ] Migrate empty-state
- [ ] Migrate frost-logo
- [ ] Migrate setting-card
- [ ] Migrate tab-nav with Svelte transitions
- [ ] Migrate breadcrumb-header
- [ ] Migrate env-var-editor

### Pages (Priority Order)
- [ ] /login
- [ ] / (home)
- [ ] /projects/new
- [ ] /projects/[id]
- [ ] /projects/[id]/services/new
- [ ] /projects/[id]/services/[serviceId]
- [ ] /projects/[id]/services/[serviceId]/deployments
- [ ] /projects/[id]/services/[serviceId]/logs
- [ ] /settings (all sub-routes)
- [ ] /projects/[id]/services/[serviceId]/settings (all sub-routes)

### API Routes
- [ ] oRPC catch-all handler
- [ ] Auth routes (login, logout, api-key)
- [ ] GitHub OAuth callback
- [ ] GitHub webhook
- [ ] Deployment logs streaming
- [ ] Monitoring endpoints

### Complex Features
- [ ] Service creation form with repo selector
- [ ] Domain management with DNS verification
- [ ] Monitoring dashboard with charts
- [ ] Real-time metrics display
- [ ] Deployment history with status

### Final Steps
- [ ] Update build scripts in package.json
- [ ] Update CLAUDE.md with new commands
- [ ] Remove React dependencies
- [ ] Delete old Next.js files
- [ ] Run full e2e test suite
- [ ] Performance testing

---

## Risk Assessment

### Low Risk
- API client migration (framework-agnostic)
- Database layer (unchanged)
- Tailwind styling (same syntax)
- Simple components

### Medium Risk
- Authentication flow (different middleware API)
- Svelte Query integration (similar but different API)
- Form handling patterns (no React hooks)

### High Risk
- Complex stateful components (domains, service creation)
- Real-time features (polling, streaming)
- Charting library replacement (Recharts to LayerChart)

---

## Rollback Strategy

1. Keep Next.js app functional until full migration complete
2. Run both apps in parallel during transition (different ports)
3. Feature flag to switch between implementations
4. Git branches for incremental progress

---

## Estimated Scope

- **Total files to migrate:** ~80 TypeScript/React files
- **Components:** 50+ React components to Svelte
- **Pages:** 23 main routes
- **API routes:** 15+ endpoints
- **Complexity:** Medium-High (stateful forms, real-time data)
