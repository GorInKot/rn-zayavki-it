import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend");
  execFileSync(path.join(backend, ".venv/bin/python"), ["-m", "app.seed", "--reset"], { cwd: backend, stdio: "inherit" });
}
