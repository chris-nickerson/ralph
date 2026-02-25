import { execFile as execFileCb } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

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
