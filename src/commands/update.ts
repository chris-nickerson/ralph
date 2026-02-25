import { spawn } from "node:child_process";

const INSTALL_URL =
  "https://raw.githubusercontent.com/chris-nickerson/ralph/main/install.sh";

export async function runUpdate(): Promise<void> {
  const res = await fetch(INSTALL_URL);
  if (!res.ok) {
    process.stderr.write("Update failed: could not download installer\n");
    process.exit(1);
  }
  const script = await res.text();

  const child = spawn("bash", ["-c", script], { stdio: "inherit" });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  process.exit(exitCode);
}
