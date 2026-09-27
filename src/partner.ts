import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { resolve, join, dirname, sep } from "node:path";
import { repoRoot } from "./store.js";

export interface PartnerOptions {
  cwd: string;
  promptFile: string;
  outputDir: string;
  mode: "read" | "edit";
  model?: string;
  effort?: string;
  resume?: string;
  timeoutSeconds?: number;
  command?: string;
}

export function partnerArgs(options: PartnerOptions, sessionId: string): string[] {
  const tools = options.mode === "edit" ? "Read,Glob,Grep,Edit,Write" : "Read,Glob,Grep";
  return [
    "--safe-mode", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--tools", tools, "--allowedTools", tools, "--permission-mode", "dontAsk",
    "--model", options.model ?? "opus", "--effort", options.effort ?? "medium",
    "--print", "--output-format", "json", options.resume ? "--resume" : "--session-id", sessionId,
  ];
}

function isSuccess(value: unknown): value is { result: string; session_id?: string; subtype: string; is_error?: boolean; permission_denials?: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.subtype === "success" && result.is_error !== true &&
    typeof result.result === "string" && result.result.trim().length > 0 &&
    (!Array.isArray(result.permission_denials) || result.permission_denials.length === 0);
}

export async function runPartner(options: PartnerOptions): Promise<{ responseFile: string; sessionId: string }> {
  const prompt = await readFile(options.promptFile, "utf8");
  if (!prompt.trim()) throw new Error("Partner prompt is empty");
  const output = resolve(options.outputDir);
  const repo = repoRoot(options.cwd);
  const privateRoot = join(repo, ".ralph", "runs");
  const parent = await realpath(dirname(output));
  if (!parent.startsWith(privateRoot + sep)) throw new Error("Partner output must be under this repository's private .ralph/runs directory");
  try { execFileSync("git", ["check-ignore", output], { cwd: repo, stdio: "ignore" }); }
  catch { throw new Error("Partner output is not Git-ignored"); }
  await mkdir(output, { recursive: false, mode: 0o700 });
  const sessionId = options.resume ?? randomUUID();
  const metadata: Record<string, unknown> = { status: "running", sessionId, mode: options.mode, model: options.model ?? "opus", effort: options.effort ?? "medium", startedAt: new Date().toISOString() };
  const saveMetadata = async () => {
    const temporary = join(output, "metadata.tmp");
    await writeFile(temporary, JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, join(output, "metadata.json"));
  };
  await saveMetadata();
  const child = spawn(options.command ?? "claude", partnerArgs(options, sessionId), { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"], detached: true });
  const completion = new Promise<number>((done) => {
    child.once("error", () => done(1));
    child.once("close", (code) => done(code ?? 1));
  });
  metadata.pid = child.pid;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  await saveMetadata();
  let timedOut = false;
  let interrupted = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stopGroup = () => {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    killTimer = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, 5000);
    killTimer.unref();
  };
  const interrupt = () => { interrupted = true; stopGroup(); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const timeout = setTimeout(() => { timedOut = true; stopGroup(); }, (options.timeoutSeconds ?? 900) * 1000);
  const exitCode = await completion;
  clearTimeout(timeout);
  if (killTimer) clearTimeout(killTimer);
  if ((timedOut || interrupted) && child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  const raw = Buffer.concat(stdout).toString("utf8");
  await writeFile(join(output, "stdout.json"), raw, { mode: 0o600 });
  await writeFile(join(output, "stderr.txt"), Buffer.concat(stderr), { mode: 0o600 });
  metadata.exitCode = exitCode;
  metadata.finishedAt = new Date().toISOString();
  try {
    if (timedOut) throw new Error("Partner call timed out");
    if (interrupted) throw new Error("Partner call was interrupted");
    if (exitCode !== 0) throw new Error(`Claude exited ${exitCode}`);
    const result = JSON.parse(raw) as unknown;
    if (!isSuccess(result)) throw new Error("Claude returned an error, permission denial, or empty response");
    const responseFile = join(output, "response.md");
    await writeFile(join(output, "response.tmp"), result.result.trimEnd() + "\n", { mode: 0o600 });
    await rename(join(output, "response.tmp"), responseFile);
    metadata.status = "success";
    metadata.sessionId = result.session_id ?? sessionId;
    metadata.modelUsage = (result as Record<string, unknown>).modelUsage;
    metadata.subagentStats = (result as Record<string, unknown>).subagent_stats;
    metadata.costUsd = (result as Record<string, unknown>).total_cost_usd;
    await saveMetadata();
    return { responseFile, sessionId: metadata.sessionId as string };
  } catch (error) {
    metadata.status = "failed";
    metadata.error = error instanceof Error ? error.message : String(error);
    await saveMetadata();
    throw new Error(`${metadata.error}; diagnostics: ${output}`);
  }
}
