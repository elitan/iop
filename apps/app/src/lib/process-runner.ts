import { spawn } from "node:child_process";

const FORCE_KILL_DELAY_MS = 5000;

export interface RunCommandOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  onData?: (chunk: string) => void;
}

export interface RunCommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  output: string;
  timedOut: boolean;
  error?: string;
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer) {
    clearTimeout(timer);
  }
}

function stopProcess(
  proc: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  try {
    proc.kill(signal);
  } catch {}
}

export function runCommand(
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  return new Promise(function onCreate(resolve) {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;

    const proc = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
    });

    function finish(result: RunCommandResult): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimer(timeoutTimer);
      clearTimer(forceKillTimer);
      resolve(result);
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutTimer = setTimeout(function onTimeout() {
        timedOut = true;
        stopProcess(proc, "SIGTERM");
        forceKillTimer = setTimeout(function onForceKill() {
          stopProcess(proc, "SIGKILL");
        }, FORCE_KILL_DELAY_MS);
      }, options.timeoutMs);
    }

    proc.stdout.on("data", function onStdout(data) {
      const chunk = data.toString();
      stdout += chunk;
      options.onData?.(chunk);
    });

    proc.stderr.on("data", function onStderr(data) {
      const chunk = data.toString();
      stderr += chunk;
      options.onData?.(chunk);
    });

    proc.on("close", function onClose(code, signal) {
      const output = stdout + stderr;
      finish({
        code,
        signal,
        stdout,
        stderr,
        output,
        timedOut,
        error:
          timedOut && options.timeoutMs
            ? `Command timed out after ${options.timeoutMs}ms`
            : undefined,
      });
    });

    proc.on("error", function onError(err) {
      const output = stdout + stderr;
      finish({
        code: null,
        signal: null,
        stdout,
        stderr,
        output,
        timedOut,
        error: err.message,
      });
    });

    if (options.stdin !== undefined) {
      proc.stdin.on("error", function ignoreError() {});
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }
  });
}
