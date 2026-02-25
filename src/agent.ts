import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import ora from "ora";
import { isUtf8, dim, formatDuration, printWarning } from "./ui.js";

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
  noReview: boolean;
  worktree: boolean;
  timeout: number;
}

let activeChild: ChildProcess | null = null;

export function killAgent(): void {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
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
): Promise<{ output: string; exitCode: number }> {
  if (options.debug) {
    return runDebug(prompt, config, options.timeout);
  }
  return runWithSpinner(prompt, config, activity, startTime, options.timeout);
}

function runDebug(
  prompt: string,
  config: AgentConfig,
  timeout: number,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    console.log(`${dim(`debug: running ${config.command}...`)}`);
    console.log("");

    const child = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChild = child;

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
      process.stdout.write(data);
      chunks.push(data);
    });

    child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data);
      chunks.push(data);
    });

    child.stdin?.write(prompt);
    child.stdin?.end();

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      activeChild = null;
      const exitCode = code ?? 1;
      const output = Buffer.concat(chunks).toString("utf-8");
      console.log("");
      if (timedOut) {
        console.log(dim(`debug: agent timed out after ${formatDuration(timeout)}`));
      } else {
        console.log(dim(`debug: exit code ${exitCode}`));
      }
      resolve({ output, exitCode });
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      activeChild = null;
      console.log("");
      console.log(dim(`debug: error: ${err.message}`));
      resolve({ output: "", exitCode: 1 });
    });
  });
}

function runWithSpinner(
  prompt: string,
  config: AgentConfig,
  activity: string,
  startTime: number,
  timeout: number,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChild = child;

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
    });

    child.stderr?.on("data", (data: Buffer) => {
      chunks.push(data);
    });

    child.stdin?.write(prompt);
    child.stdin?.end();

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

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      clearInterval(timer);
      spinner.stop();
      activeChild = null;

      const exitCode = code ?? 1;
      const output = Buffer.concat(chunks).toString("utf-8");

      if (output) {
        process.stdout.write(output);
      }

      if (timedOut) {
        printWarning(`agent timed out after ${formatDuration(timeout)}`);
      } else if (exitCode !== 0) {
        printWarning(`agent exited with code ${exitCode}`);
        console.log(`  ${dim("Run with --debug for more details")}`);
      } else if (!output) {
        printWarning("agent produced no output");
        console.log(`  ${dim("Run with --debug for more details")}`);
      }

      resolve({ output, exitCode });
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      clearInterval(timer);
      spinner.stop();
      activeChild = null;

      printWarning(`agent error: ${err.message}`);
      console.log(`  ${dim("Run with --debug for more details")}`);
      resolve({ output: "", exitCode: 1 });
    });
  });
}
