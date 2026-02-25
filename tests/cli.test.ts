import { describe, it, expect } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "src", "cli.ts");

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFile(
      "npx",
      ["tsx", cliPath, ...args],
      { cwd: join(__dirname, ".."), timeout: 10000 },
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
    expect(stdout).toContain("-w, --worktree");
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

  it("update command has no arguments", async () => {
    const { stdout } = await runCli(["update", "--help"]);
    expect(stdout).toContain("update");
    expect(stdout).toContain("Update to latest version");
  });

  it("rejects unknown options", async () => {
    const result = await runCli(["--unknown-option"]);
    expect(result.code).not.toBe(0);
  });

  it("shows default agent as claude", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toMatch(/--agent.*claude/);
  });
});
