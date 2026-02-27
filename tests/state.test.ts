import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { hasContent, countTasks, clearStateFiles, saveReview, loadReview } from "../src/state.js";

describe("hasContent", () => {
  const dir = join(tmpdir(), `ralph-test-${Date.now()}`);
  const file = join(dir, "test.md");

  beforeEach(async () => {
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await unlink(file);
    } catch {}
  });

  it("returns false for missing file", async () => {
    expect(await hasContent(join(dir, "nonexistent.md"))).toBe(false);
  });

  it("returns false for empty file", async () => {
    await writeFile(file, "");
    expect(await hasContent(file)).toBe(false);
  });

  it("returns false for whitespace-only file", async () => {
    await writeFile(file, "   \n\n  \t  \n");
    expect(await hasContent(file)).toBe(false);
  });

  it("returns true for file with content", async () => {
    await writeFile(file, "# Plan\n- [ ] Task 1\n");
    expect(await hasContent(file)).toBe(true);
  });
});

describe("countTasks", () => {
  const origCwd = process.cwd();
  const dir = join(tmpdir(), `ralph-test-count-${Date.now()}`);
  const planFile = join(dir, "IMPLEMENTATION_PLAN.md");

  beforeEach(async () => {
    await mkdir(dir, { recursive: true });
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    try {
      await unlink(planFile);
    } catch {}
  });

  it("returns 0 when file does not exist", async () => {
    expect(await countTasks()).toBe(0);
  });

  it("returns 0 when file has no tasks", async () => {
    await writeFile(planFile, "# Plan\n\nSome text\n");
    expect(await countTasks()).toBe(0);
  });

  it("counts incomplete tasks", async () => {
    await writeFile(
      planFile,
      "# Plan\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n",
    );
    expect(await countTasks()).toBe(3);
  });

  it("counts only incomplete tasks in mixed list", async () => {
    await writeFile(
      planFile,
      "- [x] Done 1\n- [ ] Open 1\n- [x] Done 2\n- [ ] Open 2\n",
    );
    expect(await countTasks()).toBe(2);
  });

  it("does not count lines with - [ ] not at start", async () => {
    await writeFile(planFile, "  - [ ] indented\ntext - [ ] mid-line\n");
    expect(await countTasks()).toBe(0);
  });
});

describe("saveReview / loadReview", () => {
  const origCwd = process.cwd();
  const dir = join(tmpdir(), `ralph-test-review-${Date.now()}`);
  const reviewFile = join(dir, "REVIEW.md");

  beforeEach(async () => {
    await mkdir(dir, { recursive: true });
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    try {
      await unlink(reviewFile);
    } catch {}
  });

  it("saveReview writes content to REVIEW.md", async () => {
    await saveReview("review content");
    const data = await readFile(reviewFile, "utf-8");
    expect(data).toBe("review content");
  });

  it("saveReview overwrites existing content", async () => {
    await writeFile(reviewFile, "old content");
    await saveReview("new content");
    const data = await readFile(reviewFile, "utf-8");
    expect(data).toBe("new content");
  });

  it("loadReview returns saved content", async () => {
    await saveReview("the review");
    expect(await loadReview()).toBe("the review");
  });

  it("loadReview throws descriptive error when file does not exist", async () => {
    await expect(loadReview()).rejects.toThrow("no review found; run ralph review first");
  });

  it("loadReview throws when file is empty", async () => {
    await writeFile(reviewFile, "");
    await expect(loadReview()).rejects.toThrow("no review found; run ralph review first");
  });

  it("loadReview throws when file is whitespace-only", async () => {
    await writeFile(reviewFile, "   \n\n  ");
    await expect(loadReview()).rejects.toThrow("no review found; run ralph review first");
  });
});

describe("clearStateFiles", () => {
  const origCwd = process.cwd();
  const dir = join(tmpdir(), `ralph-test-clear-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(dir, { recursive: true });
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
  });

  it("truncates all state files", async () => {
    await writeFile(join(dir, "IMPLEMENTATION_PLAN.md"), "# Plan");
    await writeFile(join(dir, "progress.txt"), "some progress");
    await writeFile(join(dir, "REVIEW.md"), "# Review");
    await clearStateFiles();
    expect(await hasContent(join(dir, "IMPLEMENTATION_PLAN.md"))).toBe(false);
    expect(await hasContent(join(dir, "progress.txt"))).toBe(false);
    expect(await hasContent(join(dir, "REVIEW.md"))).toBe(false);
  });
});
