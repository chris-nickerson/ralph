import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun, findRun, outcomeStatus } from "../src/store.js";
import { codexArgs, launchCodex } from "../src/process.js";

const tempDirs: string[] = [];
afterEach(async () => { for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ralph-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "-q", dir]);
  return dir;
}

it("keeps resumable run state outside tracked files", async () => {
  const repo = await fixture();
  const run = await createRun(repo, "Investigate a bug", "diagnose-only", false);
  expect((await findRun(repo)).id).toBe(run.id);
  expect(execFileSync("git", ["check-ignore", ".ralph/runs/probe/state.json"], { cwd: repo, encoding: "utf8" }).trim()).toContain(".ralph");
  expect(await readFile(join(run.dir, "workflow-state.md"), "utf8")).toContain("Phase: not started");
  expect(execFileSync("git", ["ls-files", "--", ".ralph/"], { cwd: repo, encoding: "utf8" }).trim()).toBe("");
});

it("does not count an old or missing outcome as completion", async () => {
  const run = await createRun(await fixture(), "Check a task", "local-only", false);
  await writeFile(join(run.dir, "outcome.json"), '{"status":"complete","disposition":"WORKING AS INTENDED"}');
  run.updatedAt = new Date(Date.now() + 1000).toISOString();
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  run.updatedAt = new Date(0).toISOString();
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  for (const artifact of ["source_packet.md", "independent_a.md", "independent_b.md", "consensus.md"]) await writeFile(join(run.dir, artifact), "Evidence\n");
  expect(await outcomeStatus(run, 0)).toBe("completed");
  expect(await outcomeStatus(run, 1)).toBe("failed");
});

it("requires validation and publication evidence for a full code-change run", async () => {
  const run = await createRun(await fixture(), "Fix a bug", "full", false);
  run.updatedAt = new Date(0).toISOString();
  const outcome = { status: "complete", disposition: "CODE CHANGE REQUIRED", baseSha: "abc", headSha: "def", checks: "pass", runtime: "pass", review: "pass", prUrl: "https://github.com/example/repo/pull/1", prStatus: "ready", ci: "pass" };
  await writeFile(join(run.dir, "outcome.json"), JSON.stringify(outcome));
  for (const artifact of ["source_packet.md", "independent_a.md", "independent_b.md", "consensus.md", "implementation.md", "simplification.md", "review-correctness.md", "review-compliance.md", "review-completeness.md", "runtime.md"]) await writeFile(join(run.dir, artifact), "Evidence\n");
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
  for (const artifact of ["publication.md", "babysit.md"]) await writeFile(join(run.dir, artifact), "Evidence\n");
  expect(await outcomeStatus(run, 0)).toBe("completed");
  await writeFile(join(run.dir, "outcome.json"), JSON.stringify({ ...outcome, ci: "pending" }));
  expect(await outcomeStatus(run, 0)).toBe("needs-attention");
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
