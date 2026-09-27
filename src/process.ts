import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { saveRun, type RunMode, type RunState } from "./store.js";

function installed(command: string): boolean {
  return spawnSync(command, ["--version"], { stdio: "ignore", timeout: 10_000 }).status === 0;
}

export async function checkPrerequisites(mode: RunMode): Promise<void> {
  for (const command of ["git", "codex", "claude", ...(mode === "full" ? ["gh"] : [])]) {
    if (!installed(command)) throw new Error(`${command} CLI is required for ${mode} runs`);
  }
}

export function probeClaude(): void {
  const result = spawnSync("claude", ["-p", "--safe-mode", "--tools", "Read", "Glob", "Grep", "--output-format", "json", "Reply with OK."], {
    encoding: "utf8", timeout: 30_000,
  });
  let response: { is_error?: boolean; result?: string };
  try { response = JSON.parse(result.stdout.trim()); }
  catch { throw new Error(`Claude live probe failed: ${result.stderr.trim() || "no JSON response"}`); }
  if (result.status !== 0 || response.is_error) throw new Error(`Claude is installed but unavailable: ${response.result ?? result.stderr.trim()}`);
}

export function eventText(event: Record<string, unknown>): string | undefined {
  if (event.type === "item.completed" && event.item && typeof event.item === "object") {
    const item = event.item as Record<string, unknown>;
    if (item.type === "agent_message" && typeof item.text === "string") return item.text;
  }
  return undefined;
}

export function codexArgs(run: RunState, resume = false): string[] {
  return resume
    ? ["exec", "resume", "--json", "-o", join(run.dir, "last-message.md"), run.codexSessionId!, "-"]
    : ["exec", "-C", run.repo, "--approve-for-me", "--json", "-o", join(run.dir, "last-message.md"), "-"];
}

function isAlive(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function acquireLock(lockPath: string) {
  try { return await open(lockPath, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let previous: { parentPid?: number; childPid?: number };
    try { previous = JSON.parse(await readFile(lockPath, "utf8")); }
    catch { throw new Error(`Run lock is malformed at ${lockPath}; inspect active Codex processes before removing it`); }
    if (isAlive(previous.parentPid) || isAlive(previous.childPid)) throw new Error(`Run is still active at ${lockPath}`);
    await unlink(lockPath);
    return open(lockPath, "wx", 0o600);
  }
}

export async function launchCodex(run: RunState, prompt: string, resume = false, command = "codex"): Promise<{ exitCode: number; sessionId: string | null }> {
  const lockPath = join(run.dir, "run.lock");
  const lock = await acquireLock(lockPath);
  try {
    await lock.writeFile(JSON.stringify({ parentPid: process.pid }) + "\n");
    await lock.close();
    run.status = "running";
    run.updatedAt = new Date().toISOString();
    await saveRun(run);
    const args = codexArgs(run, resume);
    const log = createWriteStream(join(run.dir, "events.jsonl"), { flags: "a", mode: 0o600 });
    const child = spawn(command, args, { cwd: run.repo, stdio: ["pipe", "pipe", "pipe"] });
    try { writeFileSync(lockPath, JSON.stringify({ parentPid: process.pid, childPid: child.pid }) + "\n", { mode: 0o600 }); }
    catch (error) { child.kill("SIGINT"); throw error; }

    let pending = "";
    let sessionId: string | null = run.codexSessionId;
    let writeQueue = Promise.resolve();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      log.write(chunk);
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        let event: Record<string, unknown>;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "thread.started" && typeof event.thread_id === "string") {
          sessionId = event.thread_id;
          run.codexSessionId = sessionId;
          writeQueue = writeQueue.then(() => saveRun(run));
        }
        const message = eventText(event);
        if (message) console.log(message);
        if (event.type === "turn.failed") console.error(`Codex turn failed: ${JSON.stringify(event.error ?? {})}`);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);

    const interrupt = () => child.kill("SIGINT");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const exitCode = await new Promise<number>((resolve) => {
      child.once("error", (error) => { console.error(error.message); resolve(1); });
      child.once("close", (code) => resolve(code ?? 1));
    });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await writeQueue;
    await new Promise<void>((resolve) => log.end(resolve));
    return { exitCode, sessionId };
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}
