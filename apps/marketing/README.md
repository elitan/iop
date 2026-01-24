# Frost Marketing Site

## Deploy with Frost

**Service Settings:**

| Setting | Value |
|---------|-------|
| Deploy type | Repository |
| Dockerfile path | `apps/marketing/Dockerfile` |
| Build context | `.` (repo root) |
| Container port | `3000` |

**Steps:**
1. Create project in Frost
2. Add service with above settings
3. Set repo URL to `https://github.com/elitan/frost`
4. Add domain (e.g. `frost.build`)
5. Deploy

## Local Build

```bash
docker build -f apps/marketing/Dockerfile -t frost-marketing .
docker run -p 3000:3000 frost-marketing
```
