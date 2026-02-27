import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "src", "cli.ts");

async function runCli(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFile(
      "npx",
      ["tsx", cliPath, ...args],
      { cwd: cwd ?? join(__dirname, ".."), timeout: 10000 },
    );
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? 1,
    };
  }
}

describe("CLI --help", () => {
  it("shows help text with all commands", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toContain("ralph");
    expect(stdout).toContain("autonomous coding loop");
    expect(stdout).toContain("plan");
    expect(stdout).toContain("refine");
    expect(stdout).toContain("build");
    expect(stdout).toContain("update");
  });

  it("shows all global options", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toContain("-a, --agent");
    expect(stdout).toContain("-d, --debug");
    expect(stdout).toContain("-f, --force");
    expect(stdout).toContain("-n, --no-commit");
    expect(stdout).toContain("--no-review");
    expect(stdout).toContain("--no-refine");
    expect(stdout).toContain("-w, --worktree");
    expect(stdout).toContain("-t, --timeout");
  });
});

describe("CLI --version", () => {
  it("outputs a semver version string", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("CLI argument parsing", () => {
  it("plan command accepts a goal argument", async () => {
    const { stdout } = await runCli(["plan", "--help"]);
    expect(stdout).toContain("[goal]");
    expect(stdout).toContain("Create implementation plan");
  });

  it("refine command accepts iterations argument", async () => {
    const { stdout } = await runCli(["refine", "--help"]);
    expect(stdout).toContain("[iterations]");
    expect(stdout).toContain("Refine plan iteratively");
  });

  it("build command accepts iterations argument", async () => {
    const { stdout } = await runCli(["build", "--help"]);
    expect(stdout).toContain("[iterations]");
    expect(stdout).toContain("Execute plan");
  });

  it("review command shows [target] and --staged", async () => {
    const { stdout } = await runCli(["review", "--help"]);
    expect(stdout).toContain("[target]");
    expect(stdout).toContain("--staged");
    expect(stdout).not.toContain("--scope");
  });

  it("fix command accepts instructions argument", async () => {
    const { stdout } = await runCli(["fix", "--help"]);
    expect(stdout).toContain("[instructions]");
    expect(stdout).toContain("Fix issues from code review");
  });

  it("update command has no arguments", async () => {
    const { stdout } = await runCli(["update", "--help"]);
    expect(stdout).toContain("update");
    expect(stdout).toContain("Update to latest version");
  });

  it("rejects unknown options", async () => {
    const result = await runCli(["--unknown-option"]);
    expect(result.code).not.toBe(0);
  });

  it("shows default agent as cursor", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toMatch(/--agent.*cursor/);
  });
});

describe("iteration argument parsing", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ralph-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("handles non-numeric build iterations without hanging", async () => {
    const result = await runCli(["build", "abc"], tempDir);
    expect(result.stderr).toContain("no implementation plan");
  }, 15000);

  it("handles non-numeric refine iterations without hanging", async () => {
    const result = await runCli(["refine", "abc"], tempDir);
    expect(result.stderr).toContain("no implementation plan");
  }, 15000);
});
