import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const root = process.cwd();
const grounded = path.join(root, ".venv-grounded-sam2", "Scripts", "python.exe");
const sam3 = path.join(root, ".venv-sam3", "Scripts", "python.exe");
const gpu = path.join(root, ".venv-image-gpu", "Scripts", "python.exe");
const python = process.env.GROUNDED_SAM2_PYTHON
  || process.env.COMPONENT_EXTRACTOR_PYTHON
  || (existsSync(grounded) ? grounded : (existsSync(sam3) ? sam3 : (existsSync(gpu) ? gpu : "python")));
const envPath = path.join(root, process.argv.includes("--env-local") ? ".env.local" : ".env");
const shouldWriteEnv = !process.argv.includes("--no-write-env");
const shouldLoadCheck = !process.argv.includes("--no-load-check");
const modelArg = process.argv.find(arg => arg.startsWith("--model="))?.split("=")[1] || "large";
const models = {
  tiny: {
    file: "sam2.1_hiera_tiny.pt",
    cfg: "configs/sam2.1/sam2.1_hiera_t.yaml",
  },
  small: {
    file: "sam2.1_hiera_small.pt",
    cfg: "configs/sam2.1/sam2.1_hiera_s.yaml",
  },
  base: {
    file: "sam2.1_hiera_base_plus.pt",
    cfg: "configs/sam2.1/sam2.1_hiera_b+.yaml",
  },
  large: {
    file: "sam2.1_hiera_large.pt",
    cfg: "configs/sam2.1/sam2.1_hiera_l.yaml",
  },
};
const selected = models[modelArg] || models.large;
const checkpointUrl = `https://dl.fbaipublicfiles.com/segment_anything_2/092824/${selected.file}`;
const modelDir = path.join(root, ".models", "sam2");
const checkpointPath = path.join(modelDir, selected.file);

function quoteEnv(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
    next.push("# Grounded-SAM2 / SAM2 local segmentation backend");
    for (const [key, value] of missing) next.push(`${key}=${quoteEnv(value)}`);
  }
  writeFileSync(filePath, `${next.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function run(args, options = {}) {
  execFileSync(python, args, {
    cwd: root,
    stdio: "inherit",
    timeout: 1800000,
    env: { ...process.env, PYTHONWARNINGS: "ignore::FutureWarning", ...options.env },
  });
}

console.log(`Using Python: ${python}`);
console.log("Installing SAM2 and optional grounding dependencies into the selected Python environment...");
run(["-m", "pip", "install", "git+https://github.com/facebookresearch/sam2.git"]);
run(["-m", "pip", "install", "transformers", "accelerate", "supervision"]);

mkdirSync(modelDir, { recursive: true });
if (!existsSync(checkpointPath)) {
  console.log(`Downloading ${selected.file}...`);
  const download = [
    "import urllib.request",
    `urllib.request.urlretrieve(${JSON.stringify(checkpointUrl)}, ${JSON.stringify(checkpointPath)})`,
  ].join("\n");
  run(["-c", download]);
} else {
  console.log(`Checkpoint already exists: ${checkpointPath}`);
}

if (shouldWriteEnv) {
  upsertEnv(envPath, {
    COMPONENT_EXTRACTOR_BACKEND: process.env.COMPONENT_EXTRACTOR_BACKEND || "auto",
    COMPONENT_EXTRACTOR_DEVICE: process.env.COMPONENT_EXTRACTOR_DEVICE || "auto",
    SAM2_CHECKPOINT: checkpointPath,
    SAM2_MODEL_CFG: selected.cfg,
    GROUNDED_SAM2_GROUNDER: "vision-boxes",
  });
  console.log(`Updated ${path.relative(root, envPath)} with SAM2_CHECKPOINT and SAM2_MODEL_CFG.`);
} else {
  console.log(`SAM2_CHECKPOINT=${checkpointPath}`);
  console.log(`SAM2_MODEL_CFG=${selected.cfg}`);
}

if (shouldLoadCheck) {
  console.log("Running Grounded-SAM2/SAM2 model load check...");
  execFileSync(process.execPath, [path.join(root, "scripts", "check-grounded-sam2.mjs"), "--load"], {
    cwd: root,
    stdio: "inherit",
    timeout: 900000,
    env: {
      ...process.env,
      SAM2_CHECKPOINT: checkpointPath,
      SAM2_MODEL_CFG: selected.cfg,
      PYTHONWARNINGS: "ignore::FutureWarning",
    },
  });
}

console.log("Grounded-SAM2/SAM2 is configured. Restart npm run dev so the component extractor can load it.");
