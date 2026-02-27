import { execFile as execFileCb } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const git = (...args: string[]) =>
  execFile("git", args, { maxBuffer: 50 * 1024 * 1024 });

export type ReviewTarget =
  | { type: "auto" }
  | { type: "staged" }
  | { type: "range"; range: string }
  | { type: "ref"; ref: string }
  | { type: "commit"; ref: string };

export interface DiffScope {
  diffCmd: string;
  scope: "branch" | "working";
  range: string;
  description: string;
}

export function parseReviewTarget(
  args: string[],
  flags: { staged: boolean },
): ReviewTarget {
  if (flags.staged && args.length > 0) {
    throw new Error("--staged cannot be combined with a positional target");
  }

  if (flags.staged) {
    return { type: "staged" };
  }

  if (args.length === 0) {
    return { type: "auto" };
  }

  if (args.length > 1) {
    throw new Error(
      "expected a single ref or range (e.g. HEAD~3, main..feature, abc123^!)",
    );
  }

  const arg = args[0];

  if (arg.startsWith("-")) {
    throw new Error(`invalid target '${arg}' — flags are not valid targets`);
  }

  if (arg.includes("..")) {
    return { type: "range", range: arg };
  }

  if (arg.endsWith("^!")) {
    return { type: "commit", ref: arg.slice(0, -2) };
  }

  return { type: "ref", ref: arg };
}

export async function validateRef(ref: string): Promise<void> {
  try {
    await git("rev-parse", "--verify", ref);
  } catch {
    throw new Error(`unknown git ref '${ref}'`);
  }
}

export async function getCommitSubject(ref: string): Promise<string> {
  try {
    const { stdout } = await git("log", "-1", "--format=%s", ref);
    return stdout.trim();
  } catch {
    throw new Error(`failed to read commit subject for '${ref}'`);
  }
}

export async function getDefaultBranch(): Promise<string | null> {
  try {
    const { stdout } = await git("symbolic-ref", "refs/remotes/origin/HEAD");
    const ref = stdout.trim().replace("refs/remotes/origin/", "");
    return ref || null;
  } catch {
    return null;
  }
}

export async function resolveReviewTarget(
  target: ReviewTarget,
): Promise<DiffScope> {
  if (target.type === "staged") {
    return {
      diffCmd: "git diff --cached",
      scope: "working",
      range: "--cached",
      description: "staged changes",
    };
  }

  if (target.type === "range") {
    const parts = target.range.split(/\.{3}|\.{2}/);
    for (const part of parts.filter(Boolean)) {
      await validateRef(part);
    }
    return {
      diffCmd: `git diff ${target.range}`,
      scope: "branch",
      range: target.range,
      description: target.range,
    };
  }

  if (target.type === "ref") {
    await validateRef(target.ref);
    const range = `${target.ref}...HEAD`;
    return {
      diffCmd: `git diff ${range}`,
      scope: "branch",
      range,
      description: range,
    };
  }

  if (target.type === "commit") {
    await validateRef(target.ref);
    const range = `${target.ref}^..${target.ref}`;
    const shortSha = target.ref.slice(0, 7);
    const subject = await getCommitSubject(target.ref);
    return {
      diffCmd: `git diff ${range}`,
      scope: "branch",
      range,
      description: `commit ${shortSha} (${subject})`,
    };
  }

  const branch = await getCurrentBranch();
  const baseBranch = await getDefaultBranch();

  if (baseBranch !== null) {
    if (branch !== baseBranch) {
      const range = `origin/${baseBranch}...HEAD`;
      return {
        diffCmd: `git diff ${range}`,
        scope: "branch",
        range,
        description: "auto-detected",
      };
    }
  } else {
    const onMain = branch === "main" || branch === "master";
    if (!onMain) {
      const hasOriginMain = await remoteRefExists("origin/main");
      if (hasOriginMain) {
        return {
          diffCmd: "git diff origin/main...HEAD",
          scope: "branch",
          range: "origin/main...HEAD",
          description: "auto-detected",
        };
      }
      const hasOriginMaster = await remoteRefExists("origin/master");
      if (hasOriginMaster) {
        return {
          diffCmd: "git diff origin/master...HEAD",
          scope: "branch",
          range: "origin/master...HEAD",
          description: "auto-detected",
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
      description: "auto-detected",
    };
  }

  return {
    diffCmd: "git diff HEAD",
    scope: "working",
    range: "HEAD",
    description: "auto-detected",
  };
}

export interface WorktreeInfo {
  branch: string;
  name: string;
  dir: string;
}

export async function getRepoRoot(): Promise<string> {
  const { stdout } = await git("rev-parse", "--show-toplevel");
  return stdout.trim();
}

export async function getHeadHash(): Promise<string> {
  try {
    const { stdout } = await git("rev-parse", "HEAD");
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

  await git("worktree", "add", "-b", branch, dir, "HEAD");

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
  const { stdout } = await git("branch", "--show-current");
  return stdout.trim();
}

export async function getDiffStat(range: string): Promise<string> {
  const { stdout } = await git("diff", "--stat", ...range.split(" "));
  return stdout.trim();
}

export async function getCommitLog(range: string): Promise<string> {
  const { stdout } = await git("log", "--oneline", ...range.split(" "));
  return stdout.trim();
}

export async function isDiffEmpty(range: string): Promise<boolean> {
  try {
    await git("diff", "--quiet", ...range.split(" "));
    return true;
  } catch (err: any) {
    if (err.code === 1) return false;
    throw err;
  }
}

async function remoteRefExists(ref: string): Promise<boolean> {
  try {
    await git("rev-parse", "--verify", ref);
    return true;
  } catch {
    return false;
  }
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
