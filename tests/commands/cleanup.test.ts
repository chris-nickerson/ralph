import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

import { CLEANUP_FILES, deleteStateFiles } from "../../src/state.js";
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

  it("logs 'nothing to clean up' when no files exist", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runCleanup({ force: true });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("nothing to clean up"));
    } finally {
      spy.mockRestore();
    }
  });

  it("deletes only the files that exist", async () => {
    await writeFile(join(dir, "IMPLEMENTATION_PLAN.md"), "plan");

    await runCleanup({ force: true });

    expect(await exists("IMPLEMENTATION_PLAN.md")).toBe(false);
    for (const file of CLEANUP_FILES.filter((f) => f !== "IMPLEMENTATION_PLAN.md")) {
      expect(await exists(file)).toBe(false);
    }
  });

  it("throws in non-interactive mode when force is false", async () => {
    await writeFile(join(dir, "IMPLEMENTATION_PLAN.md"), "plan");
    await expect(runCleanup({ force: false })).rejects.toThrow("non-interactive");
    expect(await exists("IMPLEMENTATION_PLAN.md")).toBe(true);
  });
});

describe("deleteStateFiles", () => {
  const origCwd = process.cwd();
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `ralph-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rethrows non-ENOENT errors from unlink", async () => {
    const subdir = join(dir, "not-a-file");
    await mkdir(subdir);
    await expect(deleteStateFiles([subdir])).rejects.toThrow();
  });
});
