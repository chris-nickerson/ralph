import { execFile as execFileCb } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type ReviewInstruction =
  | { type: "ref"; ref: string }
  | { type: "staged" }
  | { type: "working" }
  | { type: "branch" };

export function parseReviewInstruction(
  instruction: string,
): ReviewInstruction | undefined {
  const text = instruction.toLowerCase();

  if (/\bstaged\b/.test(text) || /\bcached\b/.test(text)) {
    return { type: "staged" };
  }

  if (
    /\bworking\b/.test(text) ||
    /\buncommitted\b/.test(text) ||
    /\bcurrent\s+(diff|changes)\b/.test(text)
  ) {
    return { type: "working" };
  }

  const refMatch = instruction.match(
    /(against|vs|versus|from|compared?\s*to|relative\s*to)\s+(\S+)/i,
  );
  if (refMatch) {
    const ref = refMatch[2].replace(/[`'"]/g, "");
    return { type: "ref", ref };
  }

  if (/\bbranch\b/.test(text)) {
    return { type: "branch" };
  }

  return undefined;
}

export interface WorktreeInfo {
  branch: string;
  name: string;
  dir: string;
}

export async function getRepoRoot(): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

export async function getHeadHash(): Promise<string> {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function createWorktree(
  mode: string,
  repoRoot: string,
): Promise<WorktreeInfo> {
  const repoName = basename(repoRoot);
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const hhmmss = formatHHMMSS(now);

  const branch = `ralph/${mode}-${timestamp}`;
  const name = `${repoName}-ralph-${hhmmss}`;
  const dir = join(dirname(repoRoot), name);

  await execFile("git", ["worktree", "add", "-b", branch, dir, "HEAD"]);

  for (const f of ["IMPLEMENTATION_PLAN.md", "progress.txt", "GOAL.md"]) {
    try {
      await copyFile(f, join(dir, f));
    } catch {
      // file doesn't exist in cwd, skip
    }
  }

  return { branch, name, dir };
}

export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execFile("git", ["branch", "--show-current"]);
  return stdout.trim();
}

export async function getDiffStat(range: string): Promise<string> {
  const args = ["diff", "--stat", ...range.split(" ")];
  const { stdout } = await execFile("git", args);
  return stdout.trim();
}

export async function getCommitLog(range: string): Promise<string> {
  const args = ["log", "--oneline", ...range.split(" ")];
  const { stdout } = await execFile("git", args);
  return stdout.trim();
}

export async function isDiffEmpty(range: string): Promise<boolean> {
  const args = ["diff", ...range.split(" ")];
  const { stdout } = await execFile("git", args);
  return stdout.trim() === "";
}

async function remoteRefExists(ref: string): Promise<boolean> {
  try {
    await execFile("git", ["rev-parse", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
}

export async function determineDiffScope(
  instruction?: ReviewInstruction,
): Promise<{ diffCmd: string; scope: "branch" | "working"; range: string }> {
  if (instruction?.type === "ref") {
    const range = `${instruction.ref}...HEAD`;
    return { diffCmd: `git diff ${range}`, scope: "branch", range };
  }

  if (instruction?.type === "staged") {
    return { diffCmd: "git diff --cached", scope: "working", range: "--cached" };
  }

  const branch = await getCurrentBranch();
  const onMain = branch === "main" || branch === "master";

  if (instruction?.type === "branch" || (!instruction && !onMain)) {
    if (!onMain) {
      const hasOriginMain = await remoteRefExists("origin/main");
      if (hasOriginMain) {
        return {
          diffCmd: "git diff origin/main...HEAD",
          scope: "branch",
          range: "origin/main...HEAD",
        };
      }
      const hasOriginMaster = await remoteRefExists("origin/master");
      if (hasOriginMaster) {
        return {
          diffCmd: "git diff origin/master...HEAD",
          scope: "branch",
          range: "origin/master...HEAD",
        };
      }
    }
  }

  const empty = await isDiffEmpty("HEAD");
  if (empty) {
    return {
      diffCmd: "git diff --cached",
      scope: "working",
      range: "--cached",
    };
  }

  return {
    diffCmd: "git diff HEAD",
    scope: "working",
    range: "HEAD",
  };
}

function formatTimestamp(d: Date): string {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${Y}${M}${D}-${h}${m}${s}`;
}

function formatHHMMSS(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}${m}${s}`;
}
