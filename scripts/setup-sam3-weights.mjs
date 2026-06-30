import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const root = process.cwd();
const bundled = path.join(root, ".venv-sam3", "Scripts", "python.exe");
const python = process.env.SAM3_PYTHON || process.env.COMPONENT_EXTRACTOR_PYTHON || (existsSync(bundled) ? bundled : "python");
const envPath = path.join(root, process.argv.includes("--env-local") ? ".env.local" : ".env");
const shouldWriteEnv = !process.argv.includes("--no-write-env");
const shouldLoadCheck = !process.argv.includes("--no-load-check");
const verbose = process.argv.includes("--verbose");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function quoteEnv(value) {
  const normalized = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${normalized}"`;
}

function upsertEnv(filePath, entries) {
  const original = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = original ? original.split(/\r?\n/) : [];
  const used = new Set();
  const next = lines.map(line => {
    const match = line.match(/^(\s*)([A-Z0-9_]+)(\s*=\s*)(.*)$/);
    if (!match || !(match[2] in entries)) return line;
    used.add(match[2]);
    return `${match[1]}${match[2]}${match[3]}${quoteEnv(entries[match[2]])}`;
  });
  const missing = Object.entries(entries).filter(([key]) => !used.has(key));
  if (missing.length) {
    if (next.length && next[next.length - 1].trim()) next.push("");
    next.push("# SAM3 local segmentation weights");
    for (const [key, value] of missing) next.push(`${key}=${quoteEnv(value)}`);
  }
  writeFileSync(filePath, `${next.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function runPython(source, extraEnv = {}) {
  const output = execFileSync(python, ["-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv, PYTHONWARNINGS: "ignore::FutureWarning" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 900000,
  }).trim();
  return JSON.parse(output || "{}");
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const probeSource = [
  "import json, os, sys",
  "status = {'python': sys.executable}",
  "try:",
  " import torch, sam3",
  " from sam3.model_builder import download_ckpt_from_hf",
  " status.update({'sam3Ready': True, 'sam3File': getattr(sam3, '__file__', ''), 'cudaAvailable': bool(torch.cuda.is_available()), 'device': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None})",
  "except Exception as error:",
  " status.update({'sam3Ready': False, 'error': str(error)})",
  "print(json.dumps(status, ensure_ascii=False))",
].join("\n");

const probe = runPython(probeSource);
if (!probe.sam3Ready) {
  console.error(`SAM3 package is not ready: ${probe.error || "unknown import error"}`);
  process.exit(1);
}
if (!probe.cudaAvailable && (process.env.COMPONENT_EXTRACTOR_DEVICE || "auto").toLowerCase() !== "cpu") {
  console.error("SAM3 package is installed, but CUDA is not available. Keep COMPONENT_EXTRACTOR_BACKEND=auto until CUDA is fixed.");
  process.exit(1);
}

console.log(`SAM3 package ready: ${probe.sam3File}`);
console.log(`GPU ready: ${probe.device || "CPU fallback requested"}`);
console.log("Downloading gated SAM3 weights from Hugging Face repo facebook/sam3...");

const downloadSource = [
  "import json",
  "from sam3.model_builder import download_ckpt_from_hf",
  "path = download_ckpt_from_hf(version='sam3')",
  "print(json.dumps({'checkpoint': path}, ensure_ascii=False))",
].join("\n");

let downloaded;
try {
  downloaded = runPython(downloadSource);
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error && error.stderr
    ? Buffer.from(error.stderr).toString("utf8")
    : "";
  const message = error instanceof Error ? error.message : String(error);
  const gated = `${stderr}\n${message}`.includes("GatedRepoError") || `${stderr}\n${message}`.includes("Cannot access gated repo") || `${stderr}\n${message}`.includes("401 Unauthorized");
  console.error("SAM3 weight download failed.");
  console.error(gated
    ? "Reason: the Hugging Face account is not authenticated or has not been granted access to the gated model facebook/sam3."
    : "Reason: the Hugging Face download command failed before returning a local checkpoint.");
  console.error("Open https://huggingface.co/facebook/sam3, log in, accept the model license/contact sharing, then run one of:");
  console.error("  .\\.venv-sam3\\Scripts\\huggingface-cli.exe login");
  console.error("  $env:HF_TOKEN='hf_...'; npm run components:sam3:setup");
  if (verbose) console.error(stderr || message);
  process.exit(1);
}

const checkpoint = downloaded.checkpoint ? path.resolve(downloaded.checkpoint) : "";
if (!checkpoint || !existsSync(checkpoint)) {
  console.error(`SAM3 checkpoint was not found after download: ${checkpoint || "(empty)"}`);
  process.exit(1);
}

if (shouldWriteEnv) {
  upsertEnv(envPath, {
    COMPONENT_EXTRACTOR_BACKEND: "auto",
    COMPONENT_EXTRACTOR_DEVICE: process.env.COMPONENT_EXTRACTOR_DEVICE || "auto",
    SAM3_CHECKPOINT: checkpoint,
    SAM3_LOAD_FROM_HF: "0",
  });
  console.log(`Updated ${path.relative(root, envPath)} with SAM3_CHECKPOINT.`);
} else {
  console.log(`SAM3_CHECKPOINT=${checkpoint}`);
}

if (shouldLoadCheck) {
  console.log("Running SAM3 model load check...");
  execFileSync(process.execPath, [path.join(root, "scripts", "check-sam3.mjs"), "--load"], {
    cwd: root,
    env: {
      ...process.env,
      SAM3_CHECKPOINT: checkpoint,
      SAM3_LOAD_FROM_HF: "0",
      COMPONENT_EXTRACTOR_BACKEND: "auto",
      PYTHONWARNINGS: "ignore::FutureWarning",
    },
    stdio: "inherit",
    timeout: 900000,
  });
}

console.log("SAM3 weights are configured. Restart npm run dev so the local component extractor can load the new checkpoint.");
