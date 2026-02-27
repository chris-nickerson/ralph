import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

import { CLEANUP_FILES } from "../../src/state.js";
import { runCleanup } from "../../src/commands/cleanup.js";

describe("runCleanup", () => {
  const origCwd = process.cwd();
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `ralph-cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  async function exists(file: string): Promise<boolean> {
    return access(join(dir, file)).then(
      () => true,
      () => false,
    );
  }

  it("deletes all cleanup files when force is true", async () => {
    for (const file of CLEANUP_FILES) {
      await writeFile(join(dir, file), "content");
    }

    await runCleanup({ force: true });

    for (const file of CLEANUP_FILES) {
      expect(await exists(file)).toBe(false);
    }
  });

  it("does not throw when no files exist", async () => {
    await expect(runCleanup({ force: true })).resolves.not.toThrow();
  });

  it("only deletes files that exist", async () => {
    await writeFile(join(dir, "IMPLEMENTATION_PLAN.md"), "plan");
    await writeFile(join(dir, "REVIEW.md"), "review");

    await runCleanup({ force: true });

    expect(await exists("IMPLEMENTATION_PLAN.md")).toBe(false);
    expect(await exists("REVIEW.md")).toBe(false);
  });

  it("deletes a subset of files when only some exist", async () => {
    await writeFile(join(dir, "progress.txt"), "progress");

    await runCleanup({ force: true });

    expect(await exists("progress.txt")).toBe(false);
  });
});
