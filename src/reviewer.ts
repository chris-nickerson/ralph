import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { repoRoot } from "./store.js";

export interface ReviewerOptions {
  cwd: string;
  promptFile: string;
  outputDir: string;
  headSha: string;
  model?: string;
  effort?: string;
  timeoutSeconds?: number;
  command?: string;
}

export function reviewerArgs(options: ReviewerOptions): string[] {
  return ["exec", "-C", options.cwd, "-s", "read-only", "-m", options.model ?? "gpt-5.6-sol", "-c", `model_reasoning_effort=${options.effort ?? "medium"}`, "--json", "-o", join(options.outputDir, "response.md"), "-"];
}

export async function runReviewer(options: ReviewerOptions): Promise<{ responseFile: string; sessionId: string }> {
  const prompt = await readFile(options.promptFile, "utf8");
  if (!prompt.trim()) throw new Error("Reviewer prompt is empty");
  const repo = repoRoot(options.cwd);
  const actualHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  if (actualHead !== options.headSha) throw new Error(`Reviewer head ${options.headSha} differs from repository HEAD ${actualHead}`);
  const output = resolve(options.outputDir);
  const parent = await realpath(dirname(output));
  if (!parent.startsWith(join(repo, ".ralph", "runs") + sep)) throw new Error("Reviewer output must be under this repository's private .ralph/runs directory");
  try { execFileSync("git", ["check-ignore", output], { cwd: repo, stdio: "ignore" }); }
  catch { throw new Error("Reviewer output is not Git-ignored"); }
  await mkdir(output, { mode: 0o700 });
  const child = spawn(options.command ?? "codex", reviewerArgs(options), { cwd: repo, stdio: ["pipe", "pipe", "pipe"], detached: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  let timedOut = false;
  let interrupted = false;
  const stopGroup = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } };
  const interrupt = () => { interrupted = true; stopGroup(); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const timeout = setTimeout(() => { timedOut = true; stopGroup(); }, (options.timeoutSeconds ?? 900) * 1000);
  const exitCode = await new Promise<number>((done) => {
    child.once("error", () => done(1));
    child.once("close", (code) => done(code ?? 1));
  });
  clearTimeout(timeout);
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  const events = Buffer.concat(stdout).toString("utf8");
  await writeFile(join(output, "events.jsonl"), events, { mode: 0o600 });
  await writeFile(join(output, "stderr.txt"), Buffer.concat(stderr), { mode: 0o600 });
  let sessionId = "";
  let completed = false;
  for (const line of events.split("\n")) {
    try {
      const event = JSON.parse(line) as { type?: string; thread_id?: string };
      if (event.type === "thread.started" && event.thread_id) sessionId = event.thread_id;
      if (event.type === "turn.completed") completed = true;
    } catch { /* non-JSON diagnostics remain in the event log */ }
  }
  let response = "";
  try { response = await readFile(join(output, "response.md"), "utf8"); } catch {}
  const success = !timedOut && !interrupted && exitCode === 0 && Boolean(sessionId && completed && response.trim());
  const metadata = { status: success ? "success" : "failed", sessionId, headSha: options.headSha, model: options.model ?? "gpt-5.6-sol", effort: options.effort ?? "medium", exitCode, timedOut, interrupted, finishedAt: new Date().toISOString() };
  await writeFile(join(output, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  if (!success) throw new Error(`Reviewer failed or returned an incomplete result; diagnostics: ${output}`);
  return { responseFile: join(output, "response.md"), sessionId };
}
