import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveRun, createRun, findRun, outcomeStatus, requirePhase, restoreRun } from "../src/store.js";
import { codexArgs, launchCodex } from "../src/process.js";
import { partnerArgs, runPartner } from "../src/partner.js";
import { reviewerArgs, runReviewer } from "../src/reviewer.js";

const tempDirs: string[] = [];
afterEach(async () => { for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ralph-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "-q", dir]);
  return dir;
}

async function consensus(dir: string) {
  for (const artifact of ["source_packet.md", "independent_a.md", "independent_b.md", "consensus.md"]) await writeFile(join(dir, artifact), "Evidence\n");
  await writeFile(join(dir, "turn_001_a.md"), "Proposal\nSTATUS: OPEN\n");
  await writeFile(join(dir, "turn_002_b.md"), "Resolution\nSTATUS: RESOLUTION_PROPOSED\n");
  await writeFile(join(dir, "turn_003_a.md"), "Confirmed\nSTATUS: CONFIRMED\n");
  const call = join(dir, "calls", "diagnosis");
  await mkdir(call, { recursive: true });
  await writeFile(join(call, "metadata.json"), '{"status":"success","sessionId":"claude-diagnosis"}');
  await writeFile(join(call, "response.md"), "Evidence\n");
}

async function simplificationReceipt(dir: string) {
  const call = join(dir, "calls", "simplification");
  await mkdir(call, { recursive: true });
  await writeFile(join(call, "metadata.json"), '{"status":"success","sessionId":"claude-simplification"}');
  await writeFile(join(call, "response.md"), "Simplification result\n");
}

async function reviewerReceipts(dir: string, headSha: string) {
  for (const lens of ["correctness", "compliance", "completeness"]) {
    const call = join(dir, "review-sessions", lens);
    await mkdir(call, { recursive: true });
    await writeFile(join(call, "metadata.json"), JSON.stringify({ status: "success", sessionId: `review-${lens}`, headSha }));
    await writeFile(join(call, "response.md"), "Review result\n");
  }
}

it("keeps resumable run state outside tracked files", async () => {
  const repo = await fixture();
  const run = await createRun(repo, "Investigate a bug", "diagnose-only", false);
  expect((await findRun(repo)).id).toBe(run.id);
  expect(execFileSync("git", ["check-ignore", ".ralph/runs/probe/state.json"], { cwd: repo, encoding: "utf8" }).trim()).toContain(".ralph");
  expect(await readFile(join(run.dir, "workflow-state.md"), "utf8")).toContain("Phase: not started");
  expect(execFileSync("git", ["ls-files", "--", ".ralph/"], { cwd: repo, encoding: "utf8" }).trim()).toBe("");
});

it("archives only completed run evidence and restores it without losing history", async () => {
  const repo = await fixture();
  const run = await createRun(repo, "Check archive", "diagnose-only", false);
  const activeDir = run.dir;
  expect((await archiveRun(run)).dir).toBe(activeDir);
  run.status = "completed";
  await archiveRun(run);
  expect(run.dir).not.toBe(activeDir);
  expect((await findRun(repo, run.id)).dir).toBe(run.dir);
  await restoreRun(run);
  expect(run.dir).toBe(activeDir);
  expect(await readFile(join(run.dir, "workflow-state.md"), "utf8")).toContain("Check archive");
});

it("does not count an old or missing outcome as completion", async () => {
  const run = await createRun(await fixture(), "Check a task", "local-only", false);
  await writeFile(join(run.dir, "outcome.json"), '{"status":"complete","disposition":"WORKING AS INTENDED"}');
  run.updatedAt = new Date(Date.now() + 1000).toISOString();
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  run.updatedAt = new Date(0).toISOString();
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  await consensus(run.dir);
  expect(await outcomeStatus(run, 0)).toBe("completed");
  expect(await outcomeStatus(run, 1)).toBe("failed");
});

it("requires validation and publication evidence for a full code-change run", async () => {
  const run = await createRun(await fixture(), "Fix a bug", "full", false);
  run.updatedAt = new Date(0).toISOString();
  await writeFile(join(run.repo, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: run.repo });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: run.repo });
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: run.repo, encoding: "utf8" }).trim();
  const fakeGh = join(run.repo, "gh");
  await writeFile(fakeGh, `#!/bin/sh\nprintf '%s\\n' '{"headRefOid":"${headSha}","isDraft":false,"statusCheckRollup":[]}'\n`, { mode: 0o700 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${run.repo}:${originalPath}`;
  const outcome = { status: "complete", disposition: "CODE CHANGE REQUIRED", baseSha: "abc", headSha, checks: "pass", runtime: "pass", review: "pass", prUrl: "https://github.com/example/repo/pull/1", prStatus: "ready", ci: "pass", externalReview: "not-configured" };
  await writeFile(join(run.dir, "outcome.json"), JSON.stringify(outcome));
  await consensus(run.dir);
  for (const artifact of ["implementation.md", "simplification.md", "review-correctness.md", "review-compliance.md", "review-completeness.md", "runtime.md"]) await writeFile(join(run.dir, artifact), "Evidence\n");
  await simplificationReceipt(run.dir);
  await reviewerReceipts(run.dir, headSha);
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  for (const artifact of ["publication.md", "babysit.md"]) await writeFile(join(run.dir, artifact), "Evidence\n");
  expect(await outcomeStatus(run, 0)).toBe("completed");
  await writeFile(join(run.dir, "outcome.json"), JSON.stringify({ ...outcome, ci: "pending" }));
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  process.env.PATH = originalPath;
});

it("records the actual Codex session and releases its run lock", async () => {
  const run = await createRun(await fixture(), "Check the README", "diagnose-only", false);
  const fake = join(run.dir, "fake-codex.sh");
  await writeFile(fake, '#!/bin/sh\ncat >/dev/null\nprintf \'{"type":"thread.started","thread_id":"test-session"}\\n\'\nprintf \'{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}\\n\'\n', { mode: 0o700 });
  const result = await launchCodex(run, "Inspect the fixture", false, fake);
  expect(result).toEqual({ exitCode: 0, sessionId: "test-session" });
  expect((await findRun(run.repo, run.id)).codexSessionId).toBe("test-session");
  await expect(stat(join(run.dir, "run.lock"))).rejects.toThrow();
  expect(codexArgs(run)).toContain("--approve-for-me");
  expect(codexArgs(run, true)).toContain("test-session");
  const resumed = await launchCodex(run, "Continue", true, fake);
  expect(resumed).toEqual({ exitCode: 0, sessionId: "test-session" });
  await expect(stat(join(run.dir, "run.lock"))).rejects.toThrow();
});

it("guards focused phases and recovers a dead run lock", async () => {
  const run = await createRun(await fixture(), "Fix a bug", "full", false);
  await expect(requirePhase(run, "simplify")).rejects.toThrow("consensus.md");
  await consensus(run.dir);
  await writeFile(join(run.dir, "implementation.md"), "Evidence\n");
  await requirePhase(run, "simplify");
  await expect(requirePhase(run, "review")).rejects.toThrow("simplification.md");
  const fake = join(run.dir, "fake-codex.sh");
  await writeFile(fake, '#!/bin/sh\ncat >/dev/null\nprintf \'{"type":"thread.started","thread_id":"recovered"}\\n\'\n', { mode: 0o700 });
  await writeFile(join(run.dir, "run.lock"), JSON.stringify({ parentPid: 2147483647, childPid: 2147483647 }));
  expect((await launchCodex(run, "Continue", false, fake)).sessionId).toBe("recovered");
});

it("records restricted Claude calls and rejects error JSON", async () => {
  const repo = await fixture();
  const run = await createRun(repo, "Partner test", "diagnose-only", false);
  const promptFile = join(run.dir, "prompt.md");
  await writeFile(promptFile, "Inspect independently");
  const success = join(repo, "fake-claude.sh");
  await writeFile(success, '#!/bin/sh\ncat >/dev/null\nprintf \'{"subtype":"success","is_error":false,"result":"Independent result","session_id":"claude-session"}\\n\'\n', { mode: 0o700 });
  const outputDir = join(run.dir, "call-ok");
  const call = await runPartner({ cwd: repo, promptFile, outputDir, mode: "read", command: success });
  expect(call.sessionId).toBe("claude-session");
  expect(await readFile(call.responseFile, "utf8")).toBe("Independent result\n");
  expect(partnerArgs({ cwd: repo, promptFile, outputDir, mode: "read" }, "id")).toContain("--safe-mode");
  expect(partnerArgs({ cwd: repo, promptFile, outputDir, mode: "edit" }, "id")).toContain("Read,Glob,Grep,Edit,Write");
  const failure = join(repo, "fake-failure.sh");
  await writeFile(failure, '#!/bin/sh\ncat >/dev/null\nprintf \'{"subtype":"error","is_error":true,"result":"usage limit"}\\n\'\n', { mode: 0o700 });
  await expect(runPartner({ cwd: repo, promptFile, outputDir: join(run.dir, "call-error"), mode: "read", command: failure })).rejects.toThrow("diagnostics");
});

it("requires a fresh read-only reviewer session and a completed response", async () => {
  const repo = await fixture();
  await writeFile(join(repo, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: repo });
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const run = await createRun(repo, "Review test", "local-only", false);
  const promptFile = join(run.dir, "review-prompt.md");
  await writeFile(promptFile, "Review the frozen diff");
  const fake = join(run.dir, "fake-reviewer.sh");
  await writeFile(fake, '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "-o" ]; then shift; output="$1"; fi\n  shift\ndone\ncat >/dev/null\nprintf "Report\\n" > "$output"\nprintf \'{"type":"thread.started","thread_id":"review-session"}\\n\'\nprintf \'{"type":"turn.completed"}\\n\'\n', { mode: 0o700 });
  const outputDir = join(run.dir, "review-session");
  expect(reviewerArgs({ cwd: repo, promptFile, outputDir, headSha })).toContain("read-only");
  const result = await runReviewer({ cwd: repo, promptFile, outputDir, headSha, command: fake });
  expect(result.sessionId).toBe("review-session");
  expect(await readFile(result.responseFile, "utf8")).toBe("Report\n");
});
