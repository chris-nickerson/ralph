import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import ora from "ora";
import { isUtf8, dim, formatDuration, printWarning, MultiSpinner } from "./ui.js";

export interface AgentConfig {
  name: string;
  command: string;
  args: string[];
}

export const AGENTS: Record<string, AgentConfig> = {
  claude: {
    name: "claude",
    command: "claude",
    args: ["-p", "--dangerously-skip-permissions"],
  },
  codex: {
    name: "codex",
    command: "codex",
    args: ["exec", "--yolo"],
  },
  cursor: {
    name: "cursor",
    command: "agent",
    args: ["-p", "-f"],
  },
};

export interface RalphOptions {
  agent: string;
  debug: boolean;
  force: boolean;
  noCommit: boolean;
  noRefine: boolean;
  noReview: boolean;
  worktree: boolean;
  timeout: number;
}

const activeChildren: ChildProcess[] = [];

export function killAgent(): void {
  for (const child of activeChildren) {
    child.kill();
  }
  activeChildren.length = 0;
}

export function validateAgent(name: string): AgentConfig {
  const config = AGENTS[name];
  if (!config) {
    throw new Error(
      `unknown agent '${name}'\nSupported agents: ${Object.keys(AGENTS).join(", ")}`,
    );
  }
  return config;
}

export function checkAgentInstalled(config: AgentConfig): void {
  try {
    execFileSync("which", [config.command], { stdio: "ignore" });
  } catch {
    throw new Error(`'${config.command}' CLI not found in PATH`);
  }
}

export async function runAgent(
  prompt: string,
  config: AgentConfig,
  options: RalphOptions,
  activity: string,
  startTime: number,
  silent?: boolean,
): Promise<{ output: string; exitCode: number }> {
  if (options.debug) {
    return runDebug(prompt, config, options.timeout);
  }
  return runWithSpinner(prompt, config, activity, startTime, options.timeout, silent);
}

interface SpawnResult {
  output: string;
  exitCode: number;
  timedOut: boolean;
  spawnError?: string;
}

function spawnAgent(
  prompt: string,
  config: AgentConfig,
  timeout: number,
  callbacks?: {
    onStdout?: (data: Buffer) => void;
    onStderr?: (data: Buffer) => void;
  },
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChildren.push(child);

    let timedOut = false;
    let settled = false;
    const killTimer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, timeout * 1000)
        : undefined;

    const chunks: Buffer[] = [];

    child.stdout?.on("data", (data: Buffer) => {
      chunks.push(data);
      callbacks?.onStdout?.(data);
    });

    child.stderr?.on("data", (data: Buffer) => {
      chunks.push(data);
      callbacks?.onStderr?.(data);
    });

    child.stdin?.on("error", () => {});
    child.stdin?.write(prompt);
    child.stdin?.end();

    const settle = (exitCode: number, error?: string) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      const idx = activeChildren.indexOf(child);
      if (idx !== -1) activeChildren.splice(idx, 1);
      resolve({
        output: error ? "" : Buffer.concat(chunks).toString("utf-8"),
        exitCode,
        timedOut,
        spawnError: error,
      });
    };

    child.on("close", (code) => settle(code ?? 1));
    child.on("error", (err) => settle(1, err.message));
  });
}

async function runDebug(
  prompt: string,
  config: AgentConfig,
  timeout: number,
): Promise<{ output: string; exitCode: number }> {
  console.log(`${dim(`debug: running ${config.command}...`)}`);
  console.log("");

  const { output, exitCode, timedOut, spawnError } = await spawnAgent(
    prompt, config, timeout, {
      onStdout: (data) => process.stdout.write(data),
      onStderr: (data) => process.stderr.write(data),
    },
  );

  console.log("");
  if (spawnError) {
    console.log(dim(`debug: error: ${spawnError}`));
  } else if (timedOut) {
    console.log(dim(`debug: agent timed out after ${formatDuration(timeout)}`));
  } else {
    console.log(dim(`debug: exit code ${exitCode}`));
  }

  return { output, exitCode };
}

async function runWithSpinner(
  prompt: string,
  config: AgentConfig,
  activity: string,
  startTime: number,
  timeout: number,
  silent?: boolean,
): Promise<{ output: string; exitCode: number }> {
  const spinner = ora({
    spinner: isUtf8 ? "dots" : { frames: ["-", "\\", "|", "/"] },
    prefixText: " ",
  });

  const elapsed = () =>
    formatDuration(Math.floor((Date.now() - startTime) / 1000));
  spinner.start(`${activity} ${dim(elapsed())}`);

  const timer = setInterval(() => {
    spinner.text = `${activity} ${dim(elapsed())}`;
  }, 500);

  const { output, exitCode, timedOut, spawnError } = await spawnAgent(
    prompt, config, timeout,
  );

  clearInterval(timer);
  spinner.stop();

  if (output && !silent) {
    process.stdout.write(output);
  }

  if (spawnError) {
    printWarning(`agent error: ${spawnError}`);
    console.log(`  ${dim("Run with --debug for more details")}`);
  } else if (timedOut) {
    printWarning(`agent timed out after ${formatDuration(timeout)}`);
  } else if (exitCode !== 0) {
    printWarning(`agent exited with code ${exitCode}`);
    console.log(`  ${dim("Run with --debug for more details")}`);
  } else if (!output) {
    printWarning("agent produced no output");
    console.log(`  ${dim("Run with --debug for more details")}`);
  }

  return { output, exitCode };
}

export async function runAgentsParallel(
  tasks: Array<{ prompt: string; label: string }>,
  config: AgentConfig,
  options: RalphOptions,
  startTime: number,
): Promise<Array<{ output: string; exitCode: number; label: string }>> {
  if (options.debug) {
    const results: Array<{ output: string; exitCode: number; label: string }> = [];
    for (const task of tasks) {
      console.log(`\n${dim(`[${task.label}]`)}`);
      const { output, exitCode } = await runDebug(task.prompt, config, options.timeout);
      results.push({ output, exitCode, label: task.label });
    }
    return results;
  }

  const spinner = new MultiSpinner({
    labels: tasks.map((t) => t.label),
    startTime,
  });

  spinner.start();

  const promises = tasks.map(async (task, i) => {
    const result = await spawnAgent(task.prompt, config, options.timeout);
    if (result.exitCode === 0 && result.output) {
      spinner.succeed(i);
    } else {
      spinner.fail(i);
    }
    return { output: result.output, exitCode: result.exitCode, label: task.label };
  });

  const results = await Promise.all(promises);

  spinner.stop();

  return results;
}
