import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

const [, , mode = "dev", ...args] = process.argv;
const env = { ...process.env };

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!(match[1] in env)) env[match[1]] = value;
  }
}

const nextArgs = mode === "start"
  ? ["start", "-H", "0.0.0.0", ...args]
  : mode === "build"
    ? ["build", ...args]
    : ["dev", "--webpack", ...(env.PORT ? ["-p", env.PORT] : []), ...args];

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  env,
  shell: false,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
