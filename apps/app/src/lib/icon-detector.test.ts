import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectIcon, detectIconFromImage } from "./icon-detector";

const TEST_DIR = join(process.cwd(), "test-icon-detector-tmp");

describe("detectIconFromImage", () => {
  test("detects postgres from image url", () => {
    expect(detectIconFromImage("postgres:17-alpine")).toBe("postgresql");
    expect(detectIconFromImage("postgres:latest")).toBe("postgresql");
  });

  test("detects redis from image url", () => {
    expect(detectIconFromImage("redis:7-alpine")).toBe("redis");
  });

  test("detects mysql from image url", () => {
    expect(detectIconFromImage("mysql:8")).toBe("mysql");
  });

  test("detects mongo from image url", () => {
    expect(detectIconFromImage("mongo:7")).toBe("mongodb");
  });

  test("detects nginx from image url", () => {
    expect(detectIconFromImage("nginx:alpine")).toBe("nginx");
  });

  test("detects node from image url", () => {
    expect(detectIconFromImage("node:20-alpine")).toBe("nodedotjs");
  });

  test("detects python from image url", () => {
    expect(detectIconFromImage("python:3.12")).toBe("python");
  });

  test("returns null for unknown images", () => {
    expect(detectIconFromImage("someunknown/image:latest")).toBeNull();
  });

  test("case insensitive matching", () => {
    expect(detectIconFromImage("POSTGRES:17")).toBe("postgresql");
    expect(detectIconFromImage("Redis:7")).toBe("redis");
  });

  test("detects from full registry path", () => {
    expect(detectIconFromImage("ghcr.io/org/postgres-custom:v1")).toBe(
      "postgresql",
    );
    expect(detectIconFromImage("docker.io/library/redis:7")).toBe("redis");
  });
});

describe("detectIcon", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("from package.json", () => {
    test("detects Next.js", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { next: "14.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("nextdotjs");
    });

    test("detects Nuxt", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { nuxt: "3.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("nuxtdotjs");
    });

    test("detects Remix from @remix-run/node", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { "@remix-run/node": "2.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("remix");
    });

    test("detects Remix from @remix-run/react", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { "@remix-run/react": "2.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("remix");
    });

    test("detects Astro", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { astro: "4.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("astro");
    });

    test("detects Svelte", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { svelte: "4.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("svelte");
    });

    test("detects Angular from @angular/core", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { "@angular/core": "17.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("angular");
    });

    test("detects Vue", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { vue: "3.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("vuedotjs");
    });

    test("detects React", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { react: "18.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("react");
    });

    test("detects Express", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { express: "4.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("express");
    });

    test("detects Fastify", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { fastify: "4.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("fastify");
    });

    test("detects Hono", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { hono: "4.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("hono");
    });

    test("detects from devDependencies", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ devDependencies: { next: "14.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("nextdotjs");
    });

    test("prioritizes framework over runtime", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({
          dependencies: { next: "14.0.0", react: "18.0.0" },
        }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("nextdotjs");
    });

    test("falls back to node for plain node projects", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { lodash: "4.0.0" } }),
      );
      expect(await detectIcon(TEST_DIR)).toBe("nodedotjs");
    });
  });

  describe("from Dockerfile", () => {
    test("detects python from base image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM python:3.12-slim\n");
      expect(await detectIcon(TEST_DIR)).toBe("python");
    });

    test("detects go from base image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM golang:1.22\n");
      expect(await detectIcon(TEST_DIR)).toBe("go");
    });

    test("detects rust from base image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM rust:1.75\n");
      expect(await detectIcon(TEST_DIR)).toBe("rust");
    });

    test("detects ruby from base image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM ruby:3.3\n");
      expect(await detectIcon(TEST_DIR)).toBe("ruby");
    });

    test("detects java from openjdk image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM openjdk:21\n");
      expect(await detectIcon(TEST_DIR)).toBe("openjdk");
    });

    test("detects node from base image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM node:20-alpine\n");
      expect(await detectIcon(TEST_DIR)).toBe("nodedotjs");
    });

    test("detects bun from base image", async () => {
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM oven/bun:1.0\n");
      expect(await detectIcon(TEST_DIR)).toBe("bun");
    });

    test("handles multi-stage builds (uses first FROM)", async () => {
      writeFileSync(
        join(TEST_DIR, "Dockerfile"),
        "FROM node:20 AS builder\nRUN npm build\nFROM nginx:alpine\nCOPY --from=builder /app/dist /usr/share/nginx/html\n",
      );
      expect(await detectIcon(TEST_DIR)).toBe("nodedotjs");
    });
  });

  describe("priority", () => {
    test("package.json takes priority over Dockerfile", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { next: "14.0.0" } }),
      );
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM python:3.12\n");
      expect(await detectIcon(TEST_DIR)).toBe("nextdotjs");
    });

    test("express in package.json beats node in Dockerfile", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { express: "4.18.0" } }),
      );
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM node:20-alpine\n");
      expect(await detectIcon(TEST_DIR)).toBe("express");
    });

    test("fastify in package.json beats node in Dockerfile", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { fastify: "4.0.0" } }),
      );
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM node:20-alpine\n");
      expect(await detectIcon(TEST_DIR)).toBe("fastify");
    });

    test("hono in package.json beats bun in Dockerfile", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { hono: "4.0.0" } }),
      );
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM oven/bun:1.0\n");
      expect(await detectIcon(TEST_DIR)).toBe("hono");
    });

    test("react in package.json beats node in Dockerfile", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({ dependencies: { react: "18.0.0" } }),
      );
      writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM node:20-alpine\n");
      expect(await detectIcon(TEST_DIR)).toBe("react");
    });
  });

  test("returns null for empty repo", async () => {
    expect(await detectIcon(TEST_DIR)).toBeNull();
  });

  test("returns null for non-existent path", async () => {
    expect(await detectIcon("/non/existent/path")).toBeNull();
  });

  test("handles malformed package.json gracefully", async () => {
    writeFileSync(join(TEST_DIR, "package.json"), "not valid json");
    writeFileSync(join(TEST_DIR, "Dockerfile"), "FROM python:3.12\n");
    expect(await detectIcon(TEST_DIR)).toBe("python");
  });
});

describe("real-world Dockerfiles", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("Next.js production Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("nodedotjs");
  });

  test("Python FastAPI Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("python");
  });

  test("Go service Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /server ./cmd/server

FROM alpine:3.19
COPY --from=builder /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("go");
  });

  test("Rust service Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM rust:1.75 AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/myapp /usr/local/bin/
CMD ["myapp"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("rust");
  });

  test("Ruby on Rails Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM ruby:3.3-slim

RUN apt-get update -qq && apt-get install -y nodejs postgresql-client
WORKDIR /app
COPY Gemfile Gemfile.lock ./
RUN bundle install
COPY . .

EXPOSE 3000
CMD ["rails", "server", "-b", "0.0.0.0"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("ruby");
  });

  test("Java Spring Boot Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM openjdk:21-jdk-slim AS builder
WORKDIR /app
COPY . .
RUN ./mvnw package -DskipTests

FROM openjdk:21-jre-slim
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("openjdk");
  });

  test("Bun application Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM oven/bun:1.0 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["bun", "run", "start"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("bun");
  });

  test("Deno application Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM denoland/deno:1.40.0

WORKDIR /app
COPY . .
RUN deno cache main.ts

EXPOSE 8000
CMD ["run", "--allow-net", "main.ts"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("deno");
  });

  test("PHP Laravel Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM php:8.3-fpm-alpine

RUN docker-php-ext-install pdo pdo_mysql
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www
COPY . .
RUN composer install --no-dev

EXPOSE 9000
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("php");
  });

  test(".NET application Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY *.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "MyApp.dll"]
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("dotnet");
  });

  test("Nginx static site Dockerfile", async () => {
    writeFileSync(
      join(TEST_DIR, "Dockerfile"),
      `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
`,
    );
    expect(await detectIcon(TEST_DIR)).toBe("nodedotjs");
  });
});

describe("public Docker images", () => {
  test("official postgres images", () => {
    expect(detectIconFromImage("postgres")).toBe("postgresql");
    expect(detectIconFromImage("postgres:17")).toBe("postgresql");
    expect(detectIconFromImage("postgres:17-alpine")).toBe("postgresql");
    expect(detectIconFromImage("postgres:17.2-bookworm")).toBe("postgresql");
  });

  test("official redis images", () => {
    expect(detectIconFromImage("redis")).toBe("redis");
    expect(detectIconFromImage("redis:7")).toBe("redis");
    expect(detectIconFromImage("redis:7-alpine")).toBe("redis");
    expect(detectIconFromImage("redis/redis-stack:latest")).toBe("redis");
  });

  test("official mysql images", () => {
    expect(detectIconFromImage("mysql")).toBe("mysql");
    expect(detectIconFromImage("mysql:8")).toBe("mysql");
    expect(detectIconFromImage("mysql:8.0-debian")).toBe("mysql");
  });

  test("official mongodb images", () => {
    expect(detectIconFromImage("mongo")).toBe("mongodb");
    expect(detectIconFromImage("mongo:7")).toBe("mongodb");
    expect(detectIconFromImage("mongo:7-jammy")).toBe("mongodb");
  });

  test("official mariadb images", () => {
    expect(detectIconFromImage("mariadb")).toBe("mariadb");
    expect(detectIconFromImage("mariadb:11")).toBe("mariadb");
  });

  test("official nginx images", () => {
    expect(detectIconFromImage("nginx")).toBe("nginx");
    expect(detectIconFromImage("nginx:alpine")).toBe("nginx");
    expect(detectIconFromImage("nginx:1.25-alpine")).toBe("nginx");
  });

  test("official node images", () => {
    expect(detectIconFromImage("node")).toBe("nodedotjs");
    expect(detectIconFromImage("node:20")).toBe("nodedotjs");
    expect(detectIconFromImage("node:20-alpine")).toBe("nodedotjs");
    expect(detectIconFromImage("node:lts-bookworm")).toBe("nodedotjs");
  });

  test("official python images", () => {
    expect(detectIconFromImage("python")).toBe("python");
    expect(detectIconFromImage("python:3.12")).toBe("python");
    expect(detectIconFromImage("python:3.12-slim")).toBe("python");
    expect(detectIconFromImage("python:3.12-alpine")).toBe("python");
  });

  test("official golang images", () => {
    expect(detectIconFromImage("golang")).toBe("go");
    expect(detectIconFromImage("golang:1.22")).toBe("go");
    expect(detectIconFromImage("golang:1.22-alpine")).toBe("go");
  });

  test("official ruby images", () => {
    expect(detectIconFromImage("ruby")).toBe("ruby");
    expect(detectIconFromImage("ruby:3.3")).toBe("ruby");
    expect(detectIconFromImage("ruby:3.3-slim")).toBe("ruby");
  });

  test("official rust images", () => {
    expect(detectIconFromImage("rust")).toBe("rust");
    expect(detectIconFromImage("rust:1.75")).toBe("rust");
    expect(detectIconFromImage("rust:1.75-alpine")).toBe("rust");
  });

  test("official php images", () => {
    expect(detectIconFromImage("php")).toBe("php");
    expect(detectIconFromImage("php:8.3")).toBe("php");
    expect(detectIconFromImage("php:8.3-fpm")).toBe("php");
    expect(detectIconFromImage("php:8.3-fpm-alpine")).toBe("php");
  });

  test("official openjdk images", () => {
    expect(detectIconFromImage("openjdk")).toBe("openjdk");
    expect(detectIconFromImage("openjdk:21")).toBe("openjdk");
    expect(detectIconFromImage("openjdk:21-jdk")).toBe("openjdk");
    expect(detectIconFromImage("openjdk:21-jre-slim")).toBe("openjdk");
  });

  test("bun images", () => {
    expect(detectIconFromImage("oven/bun")).toBe("bun");
    expect(detectIconFromImage("oven/bun:1.0")).toBe("bun");
    expect(detectIconFromImage("oven/bun:latest")).toBe("bun");
  });

  test("deno images", () => {
    expect(detectIconFromImage("denoland/deno")).toBe("deno");
    expect(detectIconFromImage("denoland/deno:1.40.0")).toBe("deno");
  });

  test("dotnet images", () => {
    expect(detectIconFromImage("mcr.microsoft.com/dotnet/sdk:8.0")).toBe(
      "dotnet",
    );
    expect(detectIconFromImage("mcr.microsoft.com/dotnet/aspnet:8.0")).toBe(
      "dotnet",
    );
  });

  test("rabbitmq images", () => {
    expect(detectIconFromImage("rabbitmq")).toBe("rabbitmq");
    expect(detectIconFromImage("rabbitmq:3-management")).toBe("rabbitmq");
  });

  test("elasticsearch images", () => {
    expect(
      detectIconFromImage(
        "docker.elastic.co/elasticsearch/elasticsearch:8.11.0",
      ),
    ).toBe("elasticsearch");
    expect(detectIconFromImage("elasticsearch:8.11.0")).toBe("elasticsearch");
  });

  test("minio images", () => {
    expect(detectIconFromImage("minio/minio")).toBe("minio");
    expect(detectIconFromImage("minio/minio:latest")).toBe("minio");
  });

  test("caddy images", () => {
    expect(detectIconFromImage("caddy")).toBe("caddy");
    expect(detectIconFromImage("caddy:2-alpine")).toBe("caddy");
  });
});
