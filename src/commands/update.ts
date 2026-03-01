import { spawn } from "node:child_process";

const INSTALL_URL =
  "https://raw.githubusercontent.com/chris-nickerson/ralph/main/install.sh";

export interface UpdateResult {
  status: "completed" | "download_failed" | "install_failed";
  exitCode: number;
}

export async function runUpdate(): Promise<UpdateResult> {
  const res = await fetch(INSTALL_URL, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    process.stderr.write("Update failed: could not download installer\n");
    return { status: "download_failed", exitCode: 1 };
  }
  const script = await res.text();

  const child = spawn("bash", ["-c", script], { stdio: "inherit" });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  return {
    status: exitCode === 0 ? "completed" : "install_failed",
    exitCode,
  };
}
