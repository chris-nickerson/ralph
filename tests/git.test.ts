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

describe("getCurrentBranch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trimmed branch name", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        expect(args).toEqual(["branch", "--show-current"]);
        return { stdout: "feature/my-branch\n", stderr: "" };
      }),
    }));

    const { getCurrentBranch } = await import("../src/git.js");
    expect(await getCurrentBranch()).toBe("feature/my-branch");
  });
});

describe("getDiffStat", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes range args to git diff --stat", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        expect(args).toEqual(["diff", "--stat", "origin/main...HEAD"]);
        return { stdout: " src/foo.ts | 10 +++\n 1 file changed\n", stderr: "" };
      }),
    }));

    const { getDiffStat } = await import("../src/git.js");
    const result = await getDiffStat("origin/main...HEAD");
    expect(result).toContain("src/foo.ts");
  });
});

describe("getCommitLog", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes range args to git log --oneline", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        expect(args).toEqual(["log", "--oneline", "origin/main...HEAD"]);
        return { stdout: "abc123 first commit\ndef456 second\n", stderr: "" };
      }),
    }));

    const { getCommitLog } = await import("../src/git.js");
    const result = await getCommitLog("origin/main...HEAD");
    expect(result).toBe("abc123 first commit\ndef456 second");
  });
});

describe("isDiffEmpty", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when diff output is empty", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        expect(args).toEqual(["diff", "HEAD"]);
        return { stdout: "", stderr: "" };
      }),
    }));

    const { isDiffEmpty } = await import("../src/git.js");
    expect(await isDiffEmpty("HEAD")).toBe(true);
  });

  it("returns false when diff has content", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({
        stdout: "diff --git a/foo.ts b/foo.ts\n",
        stderr: "",
      })),
    }));

    const { isDiffEmpty } = await import("../src/git.js");
    expect(await isDiffEmpty("HEAD")).toBe(false);
  });
});

describe("determineDiffScope", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses origin/main for branch scope when not on main", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "feature/x\n", stderr: "" };
        if (args[0] === "rev-parse" && args[2] === "origin/main")
          return { stdout: "abc\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { determineDiffScope } = await import("../src/git.js");
    const result = await determineDiffScope();
    expect(result).toEqual({
      diffCmd: "git diff origin/main...HEAD",
      scope: "branch",
      range: "origin/main...HEAD",
    });
  });

  it("falls back to origin/master when origin/main doesn't exist", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "feature/x\n", stderr: "" };
        if (args[0] === "rev-parse" && args[2] === "origin/main")
          throw new Error("not found");
        if (args[0] === "rev-parse" && args[2] === "origin/master")
          return { stdout: "abc\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { determineDiffScope } = await import("../src/git.js");
    const result = await determineDiffScope();
    expect(result).toEqual({
      diffCmd: "git diff origin/master...HEAD",
      scope: "branch",
      range: "origin/master...HEAD",
    });
  });

  it("falls back to working scope when no remote refs exist", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "feature/x\n", stderr: "" };
        if (args[0] === "rev-parse") throw new Error("not found");
        if (args[0] === "diff") return { stdout: "some diff\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { determineDiffScope } = await import("../src/git.js");
    const result = await determineDiffScope();
    expect(result).toEqual({
      diffCmd: "git diff HEAD",
      scope: "working",
      range: "HEAD",
    });
  });

  it("uses working scope on main branch with non-empty diff", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "main\n", stderr: "" };
        if (args[0] === "diff") return { stdout: "some changes\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { determineDiffScope } = await import("../src/git.js");
    const result = await determineDiffScope();
    expect(result).toEqual({
      diffCmd: "git diff HEAD",
      scope: "working",
      range: "HEAD",
    });
  });

  it("falls back to --cached when diff HEAD is empty on main", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "main\n", stderr: "" };
        if (args[0] === "diff") return { stdout: "", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { determineDiffScope } = await import("../src/git.js");
    const result = await determineDiffScope();
    expect(result).toEqual({
      diffCmd: "git diff --cached",
      scope: "working",
      range: "--cached",
    });
  });

  it("respects scopeOverride working", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "feature/x\n", stderr: "" };
        if (args[0] === "diff") return { stdout: "changes\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { determineDiffScope } = await import("../src/git.js");
    const result = await determineDiffScope("working");
    expect(result).toEqual({
      diffCmd: "git diff HEAD",
      scope: "working",
      range: "HEAD",
    });
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
