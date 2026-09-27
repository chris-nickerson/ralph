import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type RunMode = "full" | "local-only" | "diagnose-only";
export type RunStatus = "created" | "running" | "needs-attention" | "completed" | "failed";
export type Disposition = "CODE CHANGE REQUIRED" | "WORKING AS INTENDED" | "ALREADY FIXED" | "NON-CODE REMEDIATION REQUIRED" | "DUPLICATE — EXISTING WORK" | "INCONCLUSIVE";

export interface Outcome {
  status: "complete" | "needs-human";
  disposition?: Disposition;
  baseSha?: string;
  headSha?: string;
  checks?: "pass" | "fail" | "blocked" | "skip";
  runtime?: "pass" | "fail" | "blocked" | "skip";
  review?: "pass" | "fail" | "blocked" | "skip";
  prUrl?: string;
  prStatus?: "draft" | "ready";
  ci?: "pass" | "fail" | "pending" | "unavailable";
  reason?: string;
}

export interface RunState {
  id: string;
  task: string;
  repo: string;
  dir: string;
  mode: RunMode;
  keepDraft: boolean;
  status: RunStatus;
  codexSessionId: string | null;
  startedAt: string;
  updatedAt: string;
  lastExitCode: number | null;
}

export function repoRoot(path: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: resolve(path), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`${path} is not inside a Git repository`);
  }
}

function runsDir(repo: string): string { return join(repo, ".ralph", "runs"); }

async function ensurePrivateRunDir(repo: string): Promise<void> {
  const tracked = execFileSync("git", ["ls-files", "--", ".ralph/"], { cwd: repo, encoding: "utf8" }).trim();
  if (tracked) throw new Error(".ralph/ contains tracked files; refusing to store private run data there");
  const exclude = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: repo, encoding: "utf8" }).trim();
  const excludePath = resolve(repo, exclude);
  let existing = "";
  try { existing = await readFile(excludePath, "utf8"); } catch { /* new exclude file */ }
  if (!existing.split("\n").includes("/.ralph/")) {
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, `${existing}${existing.endsWith("\n") || !existing ? "" : "\n"}/.ralph/\n`, { mode: 0o600 });
  }
  try {
    execFileSync("git", ["check-ignore", ".ralph/runs/probe/state.json"], { cwd: repo, stdio: "ignore" });
  } catch {
    throw new Error("Could not verify that .ralph/runs is Git-ignored");
  }
  await mkdir(runsDir(repo), { recursive: true, mode: 0o700 });
}

export async function createRun(path: string, task: string, mode: RunMode, keepDraft: boolean): Promise<RunState> {
  const repo = repoRoot(path);
  await ensurePrivateRunDir(repo);
  const id = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomUUID().slice(0, 8)}`;
  const dir = join(runsDir(repo), id);
  await mkdir(dir, { mode: 0o700 });
  const now = new Date().toISOString();
  const run: RunState = { id, task, repo, dir, mode, keepDraft, status: "created", codexSessionId: null, startedAt: now, updatedAt: now, lastExitCode: null };
  await saveRun(run);
  await writeFile(join(dir, "workflow-state.md"), `# Ralph run ${id}\n\n- Task: ${task}\n- Mode: ${mode}\n- Phase: not started\n- Status: created\n- Repository: ${repo}\n- Blockers: none recorded\n`, { mode: 0o600 });
  return run;
}

export async function saveRun(run: RunState): Promise<void> {
  const target = join(run.dir, "run.json");
  const temporary = join(run.dir, `run.json.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(run, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, target);
}

export async function listRuns(path: string): Promise<RunState[]> {
  const repo = repoRoot(path);
  let entries: string[];
  try { entries = await readdir(runsDir(repo)); } catch { return []; }
  const runs: RunState[] = [];
  for (const id of entries) {
    try {
      const run = JSON.parse(await readFile(join(runsDir(repo), id, "run.json"), "utf8")) as RunState;
      if (run.repo === repo && run.id === id) runs.push(run);
    } catch { /* ignore incomplete run directories */ }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function findRun(path: string, id?: string): Promise<RunState> {
  const runs = await listRuns(path);
  const run = id ? runs.find((item) => item.id === id) : runs[0];
  if (!run) throw new Error(id ? `Run ${id} not found` : "No Ralph runs found in this repository");
  return run;
}

export async function outcomeStatus(run: RunState, exitCode: number): Promise<RunStatus> {
  if (exitCode !== 0) return "failed";
  try {
    const path = join(run.dir, "outcome.json");
    if ((await stat(path)).mtimeMs < new Date(run.updatedAt).getTime()) return "needs-attention";
    const outcome = JSON.parse(await readFile(path, "utf8")) as Outcome;
    if (outcome.status !== "complete" || !outcome.disposition) return "needs-attention";
    if (outcome.disposition === "INCONCLUSIVE") return "needs-attention";
    for (const artifact of ["source_packet.md", "independent_a.md", "independent_b.md", "consensus.md"]) {
      try { await stat(join(run.dir, artifact)); } catch { return "needs-attention"; }
    }
    if (run.mode === "diagnose-only" || outcome.disposition !== "CODE CHANGE REQUIRED") return "completed";
    for (const artifact of ["implementation.md", "simplification.md", "review-correctness.md", "review-compliance.md", "review-completeness.md", "runtime.md"]) {
      try { await stat(join(run.dir, artifact)); } catch { return "needs-attention"; }
    }
    if (!outcome.baseSha || !outcome.headSha || outcome.checks !== "pass" || !["pass", "skip"].includes(outcome.runtime ?? "") || outcome.review !== "pass") return "needs-attention";
    if (run.mode === "local-only") return "completed";
    for (const artifact of ["publication.md", "babysit.md"]) {
      try { await stat(join(run.dir, artifact)); } catch { return "needs-attention"; }
    }
    if (!outcome.prUrl || !/^https:\/\//.test(outcome.prUrl) || outcome.ci !== "pass") return "needs-attention";
    if (run.keepDraft && outcome.prStatus === "draft") return "completed";
    if (!run.keepDraft && outcome.prStatus === "ready") return "completed";
  } catch { /* missing or malformed outcome needs inspection */ }
  return "needs-attention";
}
