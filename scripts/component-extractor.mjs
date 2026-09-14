import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { createServer } from "net";
import path from "path";

const root = process.cwd();
loadEnv();

const host = "127.0.0.1";
const port = Number(process.env.COMPONENT_EXTRACTOR_PORT || 8765);
const baseUrl = (process.env.COMPONENT_EXTRACTOR_URL || `http://${host}:${port}`).replace(/\/$/, "");

async function ready() {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch { return false; }
}

function loadEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(root, fileName);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

if (await ready()) {
  console.log(`Component extractor is already ready at ${baseUrl}`);
  process.exit(0);
}

function canListen(port) {
  return new Promise(resolve => {
    const server = createServer();
    const finish = (available) => {
      server.removeAllListeners();
      resolve(available);
    };
    server.once("error", () => finish(false));
    server.listen({ host, port, exclusive: true }, () => server.close(() => finish(true)));
  });
}

if (!(await canListen(port))) {
  console.warn(`Component extractor port ${port} is not available. Set COMPONENT_EXTRACTOR_PORT to another port if legacy image-explode extraction is needed.`);
  process.exit(0);
}

const bundledGroundedSam2Python = path.join(root, ".venv-grounded-sam2", "Scripts", "python.exe");
const bundledSam3Python = path.join(root, ".venv-sam3", "Scripts", "python.exe");
const bundledGpuPython = path.join(root, ".venv-image-gpu", "Scripts", "python.exe");
function canRunExtractor(pythonPath) {
  if (!existsSync(pythonPath)) return false;
  return spawnSync(pythonPath, ["-c", "import cv2, numpy"], { stdio: "ignore", shell: false }).status === 0;
}
// Keep heavy CUDA/SAM runtimes isolated from the system Python.  Prefer SAM3
// when it is configured, then Grounded-SAM2, then the lighter CUDA probe
// environment and finally system Python.
const python = process.env.COMPONENT_EXTRACTOR_PYTHON
  || (canRunExtractor(bundledSam3Python)
    ? bundledSam3Python
    : (canRunExtractor(bundledGroundedSam2Python) ? bundledGroundedSam2Python : (canRunExtractor(bundledGpuPython) ? bundledGpuPython : "python")));
const child = spawn(python, ["scripts/component-extractor.py", "--host", host, "--port", String(port)], {
  cwd: root,
  stdio: "inherit",
  shell: false,
  env: { ...process.env, COMPONENT_EXTRACTOR_DEVICE: process.env.COMPONENT_EXTRACTOR_DEVICE || "auto" }
});

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", code => { if (!stopping && code) process.exit(code || 1); });
