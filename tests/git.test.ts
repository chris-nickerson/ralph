import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promisify } from "node:util";

function mockExecFile(
  handler: (cmd: string, args: string[]) => { stdout: string; stderr: string },
) {
  const fn = () => {};
  (fn as any)[promisify.custom] = (cmd: string, args: string[]) =>
    Promise.resolve(handler(cmd, args));
  return fn;
}

function mockExecFileError(
  handler: (cmd: string, args: string[]) => Error,
) {
  const fn = () => {};
  (fn as any)[promisify.custom] = (cmd: string, args: string[]) =>
    Promise.reject(handler(cmd, args));
  return fn;
}

describe("getRepoRoot", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trimmed stdout from git rev-parse", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({
        stdout: "/home/user/myrepo\n",
        stderr: "",
      })),
    }));

    const { getRepoRoot } = await import("../src/git.js");
    expect(await getRepoRoot()).toBe("/home/user/myrepo");
  });

  it("throws on git failure", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFileError(() => new Error("not a git repo")),
    }));

    const { getRepoRoot } = await import("../src/git.js");
    await expect(getRepoRoot()).rejects.toThrow();
  });
});

describe("getHeadHash", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trimmed hash", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({
        stdout: "abc123def456\n",
        stderr: "",
      })),
    }));

    const { getHeadHash } = await import("../src/git.js");
    expect(await getHeadHash()).toBe("abc123def456");
  });

  it("returns empty string on failure", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFileError(() => new Error("no HEAD")),
    }));

    const { getHeadHash } = await import("../src/git.js");
    expect(await getHeadHash()).toBe("");
  });
});

describe("createWorktree", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates correct branch and worktree names", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({ stdout: "", stderr: "" })),
    }));

    vi.doMock("node:fs/promises", () => ({
      copyFile: vi.fn().mockResolvedValue(undefined),
    }));

    const { createWorktree } = await import("../src/git.js");
    const result = await createWorktree("build", "/home/user/myrepo");

    expect(result.branch).toMatch(/^ralph\/build-\d{8}-\d{6}$/);
    expect(result.name).toMatch(/^myrepo-ralph-\d{6}$/);
    expect(result.dir).toMatch(/^\/home\/user\/myrepo-ralph-\d{6}$/);
  });

  it("calls git worktree add with correct arguments", async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        calls.push({ cmd, args });
        return { stdout: "", stderr: "" };
      }),
    }));

    vi.doMock("node:fs/promises", () => ({
      copyFile: vi.fn().mockResolvedValue(undefined),
    }));

    const { createWorktree } = await import("../src/git.js");
    const result = await createWorktree("plan", "/projects/repo");

    const gitCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "worktree",
    );
    expect(gitCall).toBeDefined();
    expect(gitCall!.args[0]).toBe("worktree");
    expect(gitCall!.args[1]).toBe("add");
    expect(gitCall!.args[2]).toBe("-b");
    expect(gitCall!.args[3]).toBe(result.branch);
    expect(gitCall!.args[4]).toBe(result.dir);
    expect(gitCall!.args[5]).toBe("HEAD");
  });

  it("copies state files into worktree", async () => {
    const copyFileMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({ stdout: "", stderr: "" })),
    }));

    vi.doMock("node:fs/promises", () => ({
      copyFile: copyFileMock,
    }));

    const { createWorktree } = await import("../src/git.js");
    await createWorktree("refine", "/home/user/myrepo");

    const copiedFiles = copyFileMock.mock.calls.map(
      (c: [string, string]) => c[0],
    );
    expect(copiedFiles).toContain("IMPLEMENTATION_PLAN.md");
    expect(copiedFiles).toContain("progress.txt");
    expect(copiedFiles).toContain("GOAL.md");
  });
});
