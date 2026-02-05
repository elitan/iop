import { describe, expect, test } from "bun:test";
import { buildDockerRunArgs, shellEscape } from "./shell-escape";

describe("shellEscape", () => {
  test("wraps normal string in single quotes", () => {
    expect(shellEscape("hello")).toBe("'hello'");
  });

  test("escapes single quotes", () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  test("handles empty string", () => {
    expect(shellEscape("")).toBe("''");
  });

  test("neutralizes backtick injection", () => {
    expect(shellEscape("`whoami`")).toBe("'`whoami`'");
  });

  test("neutralizes $() injection", () => {
    expect(shellEscape("$(rm -rf /)")).toBe("'$(rm -rf /)'");
  });

  test("neutralizes semicolon injection", () => {
    expect(shellEscape("; rm -rf /")).toBe("'; rm -rf /'");
  });

  test("handles double quotes", () => {
    expect(shellEscape('say "hello"')).toBe("'say \"hello\"'");
  });

  test("handles newlines", () => {
    expect(shellEscape("line1\nline2")).toBe("'line1\nline2'");
  });

  test("handles multiple single quotes", () => {
    expect(shellEscape("a'b'c")).toBe("'a'\\''b'\\''c'");
  });
});

describe("buildDockerRunArgs", () => {
  test("basic args", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage:latest",
      hostPort: 10000,
      containerPort: 8080,
      name: "mycontainer",
    });
    expect(args).toContain("run");
    expect(args).toContain("-d");
    expect(args).toContain("--name");
    expect(args[args.indexOf("--name") + 1]).toBe("mycontainer");
    expect(args).toContain("-p");
    expect(args[args.indexOf("-p") + 1]).toBe("10000:8080");
    expect(args[args.length - 1]).toBe("myimage:latest");
  });

  test("env vars are passed as -e flags", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      envVars: { FOO: "bar", DB_URL: "postgres://localhost" },
    });
    const envPairs = args
      .filter((_, i) => i > 0 && args[i - 1] === "-e")
      .sort();
    expect(envPairs).toContain("FOO=bar");
    expect(envPairs).toContain("DB_URL=postgres://localhost");
  });

  test("malicious env var values are passed literally (not interpreted)", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      envVars: { EVIL: '$(whoami); rm -rf / && echo "pwned"' },
    });
    const envPairs = args.filter((_, i) => i > 0 && args[i - 1] === "-e");
    const evilArg = envPairs.find((p) => p.startsWith("EVIL="));
    expect(evilArg).toBe('EVIL=$(whoami); rm -rf / && echo "pwned"');
  });

  test("network flags", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      network: "mynet",
      networkAlias: "svc.internal",
    });
    expect(args[args.indexOf("--network") + 1]).toBe("mynet");
    expect(args[args.indexOf("--network-alias") + 1]).toBe("svc.internal");
  });

  test("no network-alias without network", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      networkAlias: "svc.internal",
    });
    expect(args).not.toContain("--network-alias");
  });

  test("labels", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      labels: { "frost.managed": "true", "frost.id": "abc" },
    });
    const labelValues = args
      .filter((_, i) => i > 0 && args[i - 1] === "--label")
      .sort();
    expect(labelValues).toContain("frost.managed=true");
    expect(labelValues).toContain("frost.id=abc");
  });

  test("volumes", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      volumes: [{ name: "data-vol", path: "/data" }],
    });
    expect(args).toContain("-v");
    expect(args[args.indexOf("-v") + 1]).toBe("data-vol:/data");
  });

  test("file mounts with :ro suffix", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      fileMounts: [{ hostPath: "/host/cert.pem", containerPath: "/ssl/cert" }],
    });
    const vIdx = args.indexOf("-v");
    expect(args[vIdx + 1]).toBe("/host/cert.pem:/ssl/cert:ro");
  });

  test("resource limits", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      memoryLimit: "512m",
      cpuLimit: 1.5,
    });
    expect(args[args.indexOf("--memory") + 1]).toBe("512m");
    expect(args[args.indexOf("--cpus") + 1]).toBe("1.5");
  });

  test("shutdown timeout", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      shutdownTimeout: 15,
    });
    expect(args[args.indexOf("--stop-timeout") + 1]).toBe("15");
  });

  test("command appended after image", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      name: "test",
      command: ["sh", "-c", "echo hello"],
    });
    const imgIdx = args.indexOf("myimage");
    expect(args[imgIdx + 1]).toBe("sh");
    expect(args[imgIdx + 2]).toBe("-c");
    expect(args[imgIdx + 3]).toBe("echo hello");
  });

  test("PORT env var defaults to containerPort", () => {
    const args = buildDockerRunArgs({
      imageName: "myimage",
      hostPort: 10000,
      containerPort: 3000,
      name: "test",
    });
    const envPairs = args.filter((_, i) => i > 0 && args[i - 1] === "-e");
    expect(envPairs).toContain("PORT=3000");
  });
});
