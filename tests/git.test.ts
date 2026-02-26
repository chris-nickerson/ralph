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

describe("parseReviewTarget", () => {
  it("returns auto when no args and no staged flag", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget([], { staged: false })).toEqual({ type: "auto" });
  });

  it("returns staged when staged flag is set", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget([], { staged: true })).toEqual({ type: "staged" });
  });

  it("throws when staged flag used with positional args", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(() => parseReviewTarget(["main"], { staged: true })).toThrow(
      "--staged cannot be combined with a positional target",
    );
  });

  it("throws when multiple positional args given", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(() =>
      parseReviewTarget(["main", "feature"], { staged: false }),
    ).toThrow(
      "expected a single ref or range (e.g. HEAD~3, main..feature, abc123^!)",
    );
  });

  it("returns range for two-dot syntax", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget(["abc123..def456"], { staged: false })).toEqual({
      type: "range",
      range: "abc123..def456",
    });
  });

  it("returns range for three-dot syntax", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget(["abc123...def456"], { staged: false })).toEqual({
      type: "range",
      range: "abc123...def456",
    });
  });

  it("returns commit for ^! suffix", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget(["abc123^!"], { staged: false })).toEqual({
      type: "commit",
      ref: "abc123",
    });
  });

  it("returns ref for a plain ref", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget(["main"], { staged: false })).toEqual({
      type: "ref",
      ref: "main",
    });
  });

  it("returns ref for HEAD~3", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget(["HEAD~3"], { staged: false })).toEqual({
      type: "ref",
      ref: "HEAD~3",
    });
  });

  it("returns ref for origin/main", async () => {
    const { parseReviewTarget } = await import("../src/git.js");
    expect(parseReviewTarget(["origin/main"], { staged: false })).toEqual({
      type: "ref",
      ref: "origin/main",
    });
  });
});

describe("validateRef", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves for a valid ref", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        expect(args).toEqual(["rev-parse", "--verify", "main"]);
        return { stdout: "abc123\n", stderr: "" };
      }),
    }));

    const { validateRef } = await import("../src/git.js");
    await expect(validateRef("main")).resolves.toBeUndefined();
  });

  it("throws a clear error for an invalid ref", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFileError(() => new Error("not found")),
    }));

    const { validateRef } = await import("../src/git.js");
    await expect(validateRef("nonexistent")).rejects.toThrow(
      "unknown git ref 'nonexistent'",
    );
  });
});

describe("getCommitSubject", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trimmed commit subject", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        expect(args).toEqual(["log", "-1", "--format=%s", "abc123"]);
        return { stdout: "fix: resolve null pointer\n", stderr: "" };
      }),
    }));

    const { getCommitSubject } = await import("../src/git.js");
    expect(await getCommitSubject("abc123")).toBe("fix: resolve null pointer");
  });
});

describe("resolveReviewTarget", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns staged diff for staged target", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({ stdout: "", stderr: "" })),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "staged" });
    expect(result).toEqual({
      diffCmd: "git diff --cached",
      scope: "working",
      range: "--cached",
      description: "staged changes",
    });
  });

  it("returns range diff for two-dot range", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({ stdout: "", stderr: "" })),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({
      type: "range",
      range: "abc123..def456",
    });
    expect(result).toEqual({
      diffCmd: "git diff abc123..def456",
      scope: "branch",
      range: "abc123..def456",
      description: "abc123..def456",
    });
  });

  it("returns range diff for three-dot range", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile(() => ({ stdout: "", stderr: "" })),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({
      type: "range",
      range: "main...feature",
    });
    expect(result).toEqual({
      diffCmd: "git diff main...feature",
      scope: "branch",
      range: "main...feature",
      description: "main...feature",
    });
  });

  it("resolves ref target with ...HEAD suffix", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "rev-parse") return { stdout: "abc\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "ref", ref: "main" });
    expect(result).toEqual({
      diffCmd: "git diff main...HEAD",
      scope: "branch",
      range: "main...HEAD",
      description: "main...HEAD",
    });
  });

  it("throws for ref target with invalid ref", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFileError(() => new Error("not found")),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    await expect(
      resolveReviewTarget({ type: "ref", ref: "nonexistent" }),
    ).rejects.toThrow("unknown git ref 'nonexistent'");
  });

  it("resolves commit target with description", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "rev-parse") return { stdout: "abc\n", stderr: "" };
        if (args[0] === "log")
          return { stdout: "fix: null pointer bug\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({
      type: "commit",
      ref: "abc123def456",
    });
    expect(result).toEqual({
      diffCmd: "git diff abc123def456^..abc123def456",
      scope: "branch",
      range: "abc123def456^..abc123def456",
      description: "commit abc123d (fix: null pointer bug)",
    });
  });

  it("throws for commit target with invalid ref", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFileError(() => new Error("not found")),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    await expect(
      resolveReviewTarget({ type: "commit", ref: "badref" }),
    ).rejects.toThrow("unknown git ref 'badref'");
  });

  it("auto-detects origin/main for feature branch", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "feature/x\n", stderr: "" };
        if (args[0] === "rev-parse" && args[2] === "origin/main")
          return { stdout: "abc\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "auto" });
    expect(result).toEqual({
      diffCmd: "git diff origin/main...HEAD",
      scope: "branch",
      range: "origin/main...HEAD",
      description: "auto-detected",
    });
  });

  it("auto-detects origin/master fallback for feature branch", async () => {
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

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "auto" });
    expect(result).toEqual({
      diffCmd: "git diff origin/master...HEAD",
      scope: "branch",
      range: "origin/master...HEAD",
      description: "auto-detected",
    });
  });

  it("auto-detects working diff on main with changes", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "main\n", stderr: "" };
        if (args[0] === "diff") return { stdout: "some changes\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "auto" });
    expect(result).toEqual({
      diffCmd: "git diff HEAD",
      scope: "working",
      range: "HEAD",
      description: "auto-detected",
    });
  });

  it("auto-detects cached diff on main when HEAD diff is empty", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "main\n", stderr: "" };
        if (args[0] === "diff") return { stdout: "", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "auto" });
    expect(result).toEqual({
      diffCmd: "git diff --cached",
      scope: "working",
      range: "--cached",
      description: "auto-detected",
    });
  });

  it("auto-detects working diff when no remote refs exist", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile((cmd, args) => {
        if (args[0] === "branch") return { stdout: "feature/x\n", stderr: "" };
        if (args[0] === "rev-parse") throw new Error("not found");
        if (args[0] === "diff") return { stdout: "some diff\n", stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    }));

    const { resolveReviewTarget } = await import("../src/git.js");
    const result = await resolveReviewTarget({ type: "auto" });
    expect(result).toEqual({
      diffCmd: "git diff HEAD",
      scope: "working",
      range: "HEAD",
      description: "auto-detected",
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
