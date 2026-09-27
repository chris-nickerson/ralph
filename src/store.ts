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
  externalReview?: "pass" | "not-configured" | "pending" | "unavailable";
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
function archiveDir(repo: string): string {
  const gitPath = execFileSync("git", ["rev-parse", "--git-path", "ralph/archives"], { cwd: repo, encoding: "utf8" }).trim();
  return resolve(repo, gitPath);
}

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
  await writeFile(join(dir, "workflow-state.md"), `# Ralph run ${id}\n\n- Task/source: ${task}\n- Repository/worktree: ${repo}\n- Mode: ${mode}\n- Authorized scope: ${mode}\n- Phase: not started\n- Active writer/processes: none\n- Next action: inspect task and repository\n- Branch, base/head, remote head, PR: pending\n- Partner/reviewer sessions and models: pending\n- Budgets consumed: dialogue 0; review/repair 0; babysit 0\n- Disposition: pending\n- Checks/runtime/CI/reviewer coverage/attachments: pending separately\n- Blockers: none recorded\n- Evidence paths: ${dir}\n- External-write receipts: none\n`, { mode: 0o600 });
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
  const runs: RunState[] = [];
  for (const root of [runsDir(repo), archiveDir(repo)]) {
    let entries: string[];
    try { entries = await readdir(root); } catch { continue; }
    for (const id of entries) {
      try {
        const dir = join(root, id);
        const run = JSON.parse(await readFile(join(dir, "run.json"), "utf8")) as RunState;
        if (run.repo === repo && run.id === id) runs.push({ ...run, dir });
      } catch { /* ignore incomplete run directories */ }
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function archiveRun(run: RunState): Promise<RunState> {
  if (run.status !== "completed") return run;
  if (run.dir.startsWith(archiveDir(run.repo) + "/")) return run;
  try { await stat(join(run.dir, "run.lock")); throw new Error("Cannot archive a running Ralph process"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const target = join(archiveDir(run.repo), run.id);
  await mkdir(archiveDir(run.repo), { recursive: true, mode: 0o700 });
  try { await stat(target); throw new Error(`Archive already exists: ${target}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const previous = run.dir;
  await rename(previous, target);
  run.dir = target;
  await writeFile(join(target, "workflow-state.md"), (await readFile(join(target, "workflow-state.md"), "utf8")) + `\n- Archived from: ${previous}\n- Archived at: ${target}\n`, { mode: 0o600 });
  await saveRun(run);
  return run;
}

export async function restoreRun(run: RunState): Promise<RunState> {
  if (!run.dir.startsWith(archiveDir(run.repo) + "/")) return run;
  await ensurePrivateRunDir(run.repo);
  const target = join(runsDir(run.repo), run.id);
  try { await stat(target); throw new Error(`Active run already exists: ${target}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const previous = run.dir;
  await rename(previous, target);
  run.dir = target;
  await writeFile(join(target, "workflow-state.md"), (await readFile(join(target, "workflow-state.md"), "utf8")) + `\n- Restored from: ${previous}\n`, { mode: 0o600 });
  await saveRun(run);
  return run;
}

export async function findRun(path: string, id?: string): Promise<RunState> {
  const runs = await listRuns(path);
  const run = id ? runs.find((item) => item.id === id) : runs[0];
  if (!run) throw new Error(id ? `Run ${id} not found` : "No Ralph runs found in this repository");
  return run;
}

export async function requirePhase(run: RunState, phase: "simplify" | "review" | "babysit"): Promise<void> {
  if (run.mode === "diagnose-only") throw new Error(`${phase} is unavailable for diagnosis-only runs`);
  if (phase === "babysit" && run.mode !== "full") throw new Error("babysit requires a full PR run");
  const required = phase === "simplify"
    ? ["consensus.md", "implementation.md"]
    : phase === "review"
      ? ["consensus.md", "implementation.md", "simplification.md"]
      : ["publication.md", "runtime.md", "review-correctness.md", "review-compliance.md", "review-completeness.md"];
  const missing: string[] = [];
  for (const artifact of required) {
    try { if ((await stat(join(run.dir, artifact))).size === 0) missing.push(artifact); }
    catch { missing.push(artifact); }
  }
  if (missing.length) throw new Error(`${phase} requires phase evidence: ${missing.join(", ")}`);
  if (!(await hasConfirmedConsensus(run.dir))) throw new Error(`${phase} requires confirmed two-model consensus`);
  if (!(await hasPartnerReceipt(run.dir, "diagnosis"))) throw new Error(`${phase} requires a successful Claude diagnosis receipt`);
  if (phase !== "simplify" && !(await hasPartnerReceipt(run.dir, "simplification"))) throw new Error(`${phase} requires a successful Claude simplification receipt`);
  if (phase === "babysit" && !(await hasReviewerReceipts(run.dir, execFileSync("git", ["rev-parse", "HEAD"], { cwd: run.repo, encoding: "utf8" }).trim()))) throw new Error("babysit requires scoped reviewer receipts, including correctness at the current head");
}

async function hasConfirmedConsensus(dir: string): Promise<boolean> {
  const turns = (await readdir(dir)).filter((name) => /^turn_\d{3}_[ab]\.md$/.test(name)).sort();
  let partnerProposal = -1;
  let finalConfirmation = -1;
  for (let index = 0; index < turns.length; index++) {
    const content = (await readFile(join(dir, turns[index]), "utf8")).trimEnd();
    if (turns[index].endsWith("_b.md") && /STATUS: (RESOLUTION_PROPOSED|CONFIRMED)$/.test(content)) partnerProposal = index;
    if (turns[index].endsWith("_a.md") && /STATUS: CONFIRMED$/.test(content)) finalConfirmation = index;
  }
  return partnerProposal >= 0 && finalConfirmation > partnerProposal;
}

async function hasPartnerReceipt(dir: string, phase: "diagnosis" | "simplification"): Promise<boolean> {
  try {
    const call = join(dir, "calls", phase);
    const metadata = JSON.parse(await readFile(join(call, "metadata.json"), "utf8")) as { status?: string; sessionId?: string };
    const response = (await readFile(join(call, "response.md"), "utf8")).trim();
    if (metadata.status !== "success" || !metadata.sessionId || !response) return false;
    if (phase === "diagnosis") return response === (await readFile(join(dir, "independent_b.md"), "utf8")).trim();
    return true;
  } catch { return false; }
}

async function hasReviewerReceipts(dir: string, headSha: string): Promise<boolean> {
  const root = join(dir, "review-sessions");
  let entries: string[];
  try { entries = await readdir(root); } catch { return false; }
  for (const lens of ["correctness", "compliance", "completeness"]) {
    const candidates = entries.filter((name) => name === lens || (lens === "correctness" && /^correctness-\d+$/.test(name)));
    let passed = false;
    for (const name of candidates) {
      try {
        const call = join(root, name);
        const metadata = JSON.parse(await readFile(join(call, "metadata.json"), "utf8")) as { status?: string; sessionId?: string; headSha?: string };
        const response = await readFile(join(call, "response.md"), "utf8");
        if (metadata.status === "success" && metadata.sessionId && response.trim() && (lens !== "correctness" || metadata.headSha === headSha)) passed = true;
      } catch { /* inspect another receipt */ }
    }
    if (!passed) return false;
  }
  return true;
}

function publishedPrMatches(outcome: Outcome): boolean {
  if (!outcome.prUrl || !outcome.headSha) return false;
  try {
    const raw = execFileSync("gh", ["pr", "view", outcome.prUrl, "--json", "headRefOid,isDraft,statusCheckRollup"], { encoding: "utf8", timeout: 15_000 });
    const pr = JSON.parse(raw) as { headRefOid?: string; isDraft?: boolean; statusCheckRollup?: Array<{ state?: string; status?: string; conclusion?: string }> };
    if (pr.headRefOid !== outcome.headSha || pr.isDraft !== (outcome.prStatus === "draft")) return false;
    return Array.isArray(pr.statusCheckRollup) && pr.statusCheckRollup.every((check) => {
      if (check.state) return check.state === "SUCCESS";
      return check.status === "COMPLETED" && check.conclusion === "SUCCESS";
    });
  } catch { return false; }
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
      try { if ((await stat(join(run.dir, artifact))).size === 0) return "needs-attention"; }
      catch { return "needs-attention"; }
    }
    if (!(await hasConfirmedConsensus(run.dir))) return "needs-attention";
    if (!(await hasPartnerReceipt(run.dir, "diagnosis"))) return "needs-attention";
    if (run.mode === "diagnose-only" || outcome.disposition !== "CODE CHANGE REQUIRED") return "completed";
    for (const artifact of ["implementation.md", "simplification.md", "review-correctness.md", "review-compliance.md", "review-completeness.md", "runtime.md"]) {
      try { if ((await stat(join(run.dir, artifact))).size === 0) return "needs-attention"; }
      catch { return "needs-attention"; }
    }
    if (!(await hasPartnerReceipt(run.dir, "simplification"))) return "needs-attention";
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: run.repo, encoding: "utf8" }).trim();
    if (!(await hasReviewerReceipts(run.dir, head))) return "needs-attention";
    if (!outcome.baseSha || outcome.headSha !== head || outcome.checks !== "pass" || !["pass", "skip"].includes(outcome.runtime ?? "") || outcome.review !== "pass") return "needs-attention";
    if (run.mode === "local-only") return "completed";
    for (const artifact of ["publication.md", "babysit.md"]) {
      try { if ((await stat(join(run.dir, artifact))).size === 0) return "needs-attention"; }
      catch { return "needs-attention"; }
    }
    if (!outcome.prUrl || !/^https:\/\//.test(outcome.prUrl) || outcome.ci !== "pass" || !["pass", "not-configured"].includes(outcome.externalReview ?? "")) return "needs-attention";
    if (!publishedPrMatches(outcome)) return "needs-attention";
    if (run.keepDraft && outcome.prStatus === "draft") return "completed";
    if (!run.keepDraft && outcome.prStatus === "ready") return "completed";
  } catch { /* missing or malformed outcome needs inspection */ }
  return "needs-attention";
}
