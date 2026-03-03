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

export const SPINNER_INTERVAL_MS = 80;

export const dim = isTTY ? pc.dim : (s: string) => s;
export const bold = isTTY ? pc.bold : (s: string) => s;
export const green = isTTY ? pc.green : (s: string) => s;
export const yellow = isTTY ? pc.yellow : (s: string) => s;
export const red = isTTY ? pc.red : (s: string) => s;

export function line(): string {
  return "-".repeat(WIDTH);
}

export function secondsSince(start: number): number {
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins}m`;
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
  elapsed?: number,
): void {
  console.log("");
  console.log(dim(line()));
  let msg = `  iteration ${iteration} ${dim(SYM_DOT)} ${phase}`;
  if (detail) msg += ` ${dim(SYM_DOT)} ${detail}`;
  if (elapsed != null) msg += ` ${dim(SYM_DOT)} ${dim(formatDuration(elapsed))}`;
  console.log(msg);
  console.log("");
}

export function printStep(
  step: number,
  label: string,
  detail?: string,
  elapsed?: number,
): void {
  console.log("");
  console.log(dim(line()));
  let msg = `  step ${step} ${dim(SYM_DOT)} ${label}`;
  if (detail) msg += ` ${dim(SYM_DOT)} ${detail}`;
  if (elapsed != null) msg += ` ${dim(SYM_DOT)} ${dim(formatDuration(elapsed))}`;
  console.log(msg);
  console.log("");
}

export function printComplete(iterations: number, elapsed: number): void {
  const word = iterations === 1 ? "iteration" : "iterations";
  console.log("");
  console.log(dim(line()));
  console.log(
    `  ${green(SYM_CHECK)} ${dim(SYM_DOT)} ${iterations} ${word} ${dim(SYM_DOT)} ${formatDuration(elapsed)}`,
  );
  console.log(dim(line()));
  console.log("");
}

export function printTimingSummary(
  stepSeconds: number,
  totalSeconds: number,
): void {
  console.log(
    dim(
      `  ${formatDuration(stepSeconds)} elapsed ${SYM_DOT} ${formatDuration(totalSeconds)} total`,
    ),
  );
}

export function printLimitReached(
  max: number,
  scriptName: string,
  mode: string,
  isWorktree: boolean,
  elapsed?: number,
): void {
  console.log("");
  console.log(dim(line()));
  let msg = `  ${yellow(SYM_PAUSE)} iteration limit reached (${max})`;
  if (elapsed != null) msg += ` ${dim(SYM_DOT)} ${dim(formatDuration(elapsed))}`;
  console.log(msg);
  if (!isWorktree) {
    console.log(`  ${dim("Run")} ${scriptName} ${mode} ${dim("to continue")}`);
  }
  console.log(dim(line()));
  console.log("");
}

export function printWorktreeNext(
  action: "merge" | "resume" | "build",
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

const SPINNER_FRAMES_UTF8 = [
  "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
];
const SPINNER_FRAMES_ASCII = ["-", "\\", "|", "/"];

export interface MultiSpinnerOptions {
  labels: string[];
  startTime: number;
  isTTY?: boolean;
  colors?: Array<(s: string) => string>;
  totalStartTime?: number;
}

type LineState = "spinning" | "succeeded" | "failed";

export class MultiSpinner {
  private labels: string[];
  private startTime: number;
  private tty: boolean;
  private states: LineState[];
  private frozenElapsed: (number | null)[];
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private maxLabelLen: number;
  private frames: string[];
  private colors: Array<(s: string) => string>;
  private totalStartTime: number | undefined;

  constructor(options: MultiSpinnerOptions) {
    this.labels = options.labels;
    this.startTime = options.startTime;
    this.tty = options.isTTY ?? isTTY;
    this.states = options.labels.map(() => "spinning" as LineState);
    this.frozenElapsed = options.labels.map(() => null);
    this.maxLabelLen = Math.max(0, ...options.labels.map((l) => l.length));
    this.frames = isUtf8 ? SPINNER_FRAMES_UTF8 : SPINNER_FRAMES_ASCII;
    this.colors = options.colors ?? options.labels.map(() => (s: string) => s);
    this.totalStartTime = options.totalStartTime;
  }

  start(): void {
    if (!this.tty) {
      const bullet = isUtf8 ? "▸" : ">";
      for (const label of this.labels) {
        process.stdout.write(`  ${bullet} ${label}\n`);
      }
      return;
    }
    this.render();
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      const lines = this.totalStartTime != null ? this.labels.length + 1 : this.labels.length;
      process.stdout.write(`\x1b[${lines}A`);
      this.render();
    }, SPINNER_INTERVAL_MS);
  }

  succeed(index: number): void {
    this.states[index] = "succeeded";
    this.frozenElapsed[index] = Math.floor(
      (Date.now() - this.startTime) / 1000,
    );
    if (!this.tty) {
      const mark = isUtf8 ? green("✓") : green("done");
      const elapsed = formatDuration(this.frozenElapsed[index]!);
      process.stdout.write(`  ${mark} ${this.labels[index]}  ${dim(elapsed)}\n`);
    }
  }

  fail(index: number): void {
    this.states[index] = "failed";
    this.frozenElapsed[index] = Math.floor(
      (Date.now() - this.startTime) / 1000,
    );
    if (!this.tty) {
      const mark = isUtf8 ? red("✗") : red("fail");
      const elapsed = formatDuration(this.frozenElapsed[index]!);
      process.stdout.write(`  ${mark} ${this.labels[index]}  ${dim(elapsed)}\n`);
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.tty) {
      const lines = this.totalStartTime != null ? this.labels.length + 1 : this.labels.length;
      process.stdout.write(`\x1b[${lines}A`);
      this.render();
    } else if (this.totalStartTime != null) {
      const total = formatDuration(secondsSince(this.totalStartTime));
      process.stdout.write(`  ${dim(total + ' total')}\n`);
    }
    process.stdout.write("\n");
  }

  private render(): void {
    const currentElapsed = Math.floor((Date.now() - this.startTime) / 1000);
    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i].padEnd(this.maxLabelLen);
      const elapsed = this.frozenElapsed[i] ?? currentElapsed;
      const timeStr = dim(formatDuration(elapsed));
      let prefix: string;
      switch (this.states[i]) {
        case "succeeded":
          prefix = isUtf8 ? green("✓") : green("done");
          break;
        case "failed":
          prefix = isUtf8 ? red("✗") : red("fail");
          break;
        default:
          prefix = this.colors[i](this.frames[this.frameIndex]);
          break;
      }
      process.stdout.write(`\x1b[2K  ${prefix} ${label}  ${timeStr}\n`);
    }
    if (this.totalStartTime != null) {
      const total = formatDuration(secondsSince(this.totalStartTime));
      const prefixLen = isUtf8 ? 1 : 4;
      const pad = 2 + prefixLen + 1 + this.maxLabelLen + 2;
      const footer = dim(total + ' total');
      process.stdout.write(`\x1b[2K${' '.repeat(pad)}${footer}\n`);
    }
  }
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
      const answer = (response.trim() || defaultVal).toLowerCase();
      resolve(answer === "y");
      rl.close();
    });
    rl.once("close", () => resolve(false));
  });
}
