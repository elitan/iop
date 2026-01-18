# Frost Templates

Community-contributed templates for deploying services with Frost.

## Directory Structure

```
templates/
  databases/     # Single-service database templates (postgres, mysql, redis, etc.)
  services/      # Single-service application templates (nginx, httpbin, etc.)
  projects/      # Multi-service project templates (plausible, ghost, etc.)
```

## Template Types

### Single-Service Templates (databases/, services/)
Creates one service within an existing project. Use for standalone databases or simple services.

### Project Templates (projects/)
Creates a new project with multiple services pre-configured. Use for complete application stacks.

## YAML Format

```yaml
name: Service Name
description: Short description
category: database|webserver|testing|analytics|etc
docs: https://link-to-documentation

services:
  service-name:
    image: docker/image:tag
    port: 8080                    # container port
    main: true                    # (projects only) gets domain, shown first
    type: database                # optional: marks as database service
    command: /bin/sh -c "..."     # optional: custom startup command
    environment:
      STATIC_VAR: value
      GENERATED_VAR:
        generated: password       # auto-generate credential
      CROSS_REF: ${other.VAR}     # reference other service's env var
    volumes:
      - data:/path/in/container   # named volume
    health_check:
      path: /health               # optional: HTTP health check path
      timeout: 60                 # seconds to wait for healthy
    ssl: true                     # optional: generate self-signed cert (databases)
```

## Generated Values

Use `generated` to auto-generate credentials:

- `password`: 32-char random string (nanoid)
- `base64_32`: 32-byte base64-encoded secret
- `base64_64`: 64-byte base64-encoded secret

## Cross-Service References

In project templates, reference other services' environment variables:

```yaml
DATABASE_URL: postgres://user:${postgres.POSTGRES_PASSWORD}@postgres:5432/db
```

Format: `${service_name.ENV_VAR_NAME}`

## Contributing

1. Create a new YAML file in the appropriate directory
2. Test locally with Frost
3. Submit a PR

Keep templates minimal - users can customize after creation.
