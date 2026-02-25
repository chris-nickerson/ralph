import pc from "picocolors";
import { createInterface } from "node:readline";
import type { WorktreeInfo } from "./git.js";

const isTTY =
  process.stdout.isTTY === true && process.env.TERM !== "dumb";

const localeStr =
  process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? "";
export const isUtf8 = localeStr.includes("UTF-8");

const WIDTH = 74;

export const SYM_DOT = isUtf8 ? "•" : ".";
export const SYM_CHECK = "done";
export const SYM_PAUSE = "--";
export const SYM_BULLET = "*";

export const dim = isTTY ? pc.dim : (s: string) => s;
export const bold = isTTY ? pc.bold : (s: string) => s;
export const green = isTTY ? pc.green : (s: string) => s;
export const yellow = isTTY ? pc.yellow : (s: string) => s;
export const red = isTTY ? pc.red : (s: string) => s;

export function line(): string {
  return "-".repeat(WIDTH);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function printHeader(mode: string): void {
  console.log("");
  console.log(dim(line()));
  console.log(`${bold("  ralph")} ${dim(SYM_DOT)} ${mode}`);
  console.log(dim(line()));
}

export function printKv(key: string, value: string): void {
  const padded = key.padEnd(8);
  process.stdout.write(`  ${dim(padded)} ${value}\n`);
}

export function printPhase(
  iteration: number,
  phase: string,
  detail?: string,
): void {
  console.log("");
  console.log(dim(line()));
  if (detail) {
    console.log(
      `  iteration ${iteration} ${dim(SYM_DOT)} ${phase} ${dim(SYM_DOT)} ${detail}`,
    );
  } else {
    console.log(`  iteration ${iteration} ${dim(SYM_DOT)} ${phase}`);
  }
  console.log("");
}

export function printComplete(iterations: number, elapsed: string): void {
  const word = iterations === 1 ? "iteration" : "iterations";
  console.log("");
  console.log(dim(line()));
  console.log(
    `  ${green(SYM_CHECK)} ${dim(SYM_DOT)} ${iterations} ${word} ${dim(SYM_DOT)} ${elapsed}`,
  );
  console.log(dim(line()));
  console.log("");
}

export function printLimitReached(
  max: number,
  scriptName: string,
  mode: string,
  isWorktree: boolean,
): void {
  console.log("");
  console.log(dim(line()));
  console.log(`  ${yellow(SYM_PAUSE)} iteration limit reached (${max})`);
  if (!isWorktree) {
    console.log(`  ${dim("Run")} ${scriptName} ${mode} ${dim("to continue")}`);
  }
  console.log(dim(line()));
  console.log("");
}

export function printWorktreeNext(
  action: "merge" | "resume" | "build" | "plan",
  worktreeInfo: WorktreeInfo,
  scriptName: string,
  mode: string,
): void {
  const reldir = `../${worktreeInfo.name}`;
  printKv("branch", worktreeInfo.branch);

  switch (action) {
    case "merge":
      printKv("merge", `git merge ${worktreeInfo.branch}`);
      break;
    case "resume":
      printKv("resume", `cd ${reldir} && ${scriptName} ${mode}`);
      break;
    case "build":
      printKv("build", `cd ${reldir} && ${scriptName} build`);
      break;
    case "plan":
      printKv("refine", `cd ${reldir} && ${scriptName} refine`);
      printKv("build", `cd ${reldir} && ${scriptName} build`);
      break;
  }

  printKv("cleanup", `git worktree remove --force ${reldir}`);
  console.log("");
}

export function printError(msg: string): void {
  process.stderr.write(`${red("error:")} ${msg}\n`);
}

export function printWarning(msg: string): void {
  console.log("");
  console.log(`${yellow("warning:")} ${msg}`);
}

export async function confirm(
  prompt: string,
  defaultVal: string = "n",
  force: boolean = false,
): Promise<boolean> {
  if (force) return true;

  if (!process.stdin.isTTY) {
    throw new Error("non-interactive mode; use --force to proceed");
  }

  const hint = defaultVal === "y" ? "[Y/n]" : "[y/N]";
  process.stdout.write(`${prompt} ${dim(hint)} `);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.once("line", (response) => {
      rl.close();
      const answer = (response.trim() || defaultVal).toLowerCase();
      resolve(answer === "y");
    });
    rl.once("close", () => resolve(false));
  });
}
