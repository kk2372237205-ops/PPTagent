import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

const root = process.cwd();
loadEnv();
const bundled = path.join(root, ".venv-sam3", "Scripts", "python.exe");
const python = process.env.SAM3_PYTHON || process.env.COMPONENT_EXTRACTOR_PYTHON || (existsSync(bundled) ? bundled : "python");
const shouldLoadModel = process.argv.includes("--load");

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

const probe = [
  "import json, os, sys",
  "status = {'python': sys.executable}",
  "try:",
  " import torch, cv2, numpy, sam3",
  " from sam3.model_builder import build_sam3_image_model",
  " checkpoint = os.getenv('SAM3_CHECKPOINT') or ''",
  " hf_requested = os.getenv('SAM3_LOAD_FROM_HF') in {'1', 'true', 'TRUE', 'yes', 'YES'}",
  " status.update({",
  "  'sam3PackageReady': True,",
  "  'sam3File': getattr(sam3, '__file__', ''),",
  "  'torch': torch.__version__,",
  "  'cuda': torch.version.cuda,",
  "  'cudaAvailable': bool(torch.cuda.is_available()),",
  "  'device': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,",
  "  'numpy': numpy.__version__,",
  "  'opencv': cv2.__version__,",
  "  'checkpoint': checkpoint,",
  "  'checkpointReady': bool(checkpoint and os.path.exists(checkpoint)),",
  "  'hfRequested': hf_requested,",
  "  'canImportBuilder': callable(build_sam3_image_model),",
  " })",
  shouldLoadModel ? " if not checkpoint and not hf_requested: raise RuntimeError('Set SAM3_CHECKPOINT or SAM3_LOAD_FROM_HF=1 before --load')" : "",
  shouldLoadModel ? " device = 'cuda' if torch.cuda.is_available() else 'cpu'" : "",
  shouldLoadModel ? " model = build_sam3_image_model(checkpoint_path=checkpoint or None, load_from_HF=bool(hf_requested and not checkpoint), device=device, eval_mode=True, compile=False)" : "",
  shouldLoadModel ? " status.update({'modelLoadReady': True, 'modelDevice': device, 'modelClass': model.__class__.__name__})" : "",
  "except Exception as error:",
  " status.update({'sam3PackageReady': False, 'error': str(error)})",
  "print(json.dumps(status, ensure_ascii=False))",
].join("\n");

try {
  const output = execFileSync(python, ["-c", probe], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const status = JSON.parse(output || "{}");
  if (!status.sam3PackageReady) {
    console.error(`SAM3 not ready: ${status.error || "package import failed"}`);
    process.exit(1);
  }

  console.log(`SAM3 package ready: ${status.sam3File}`);
  console.log(`GPU ready: ${status.device || "no CUDA"} · PyTorch ${status.torch} · CUDA ${status.cuda || "none"}`);
  console.log(`Runtime deps: numpy ${status.numpy} · OpenCV ${status.opencv}`);

  if (status.checkpointReady) {
    console.log(`SAM3 checkpoint ready: ${status.checkpoint}`);
  } else if (status.hfRequested) {
    console.log("SAM3 weights: configured for Hugging Face loading; run-time access still depends on your HF login/approval.");
  } else {
    console.log("SAM3 weights: not configured yet. Set SAM3_CHECKPOINT to a downloaded checkpoint, or set SAM3_LOAD_FROM_HF=1 after Hugging Face access is approved.");
  }

  if (shouldLoadModel) {
    if (status.modelLoadReady) {
      console.log(`SAM3 model load ready: ${status.modelClass} on ${status.modelDevice}`);
    } else {
      console.error(`SAM3 model load failed: ${status.error || "unknown error"}`);
      process.exit(1);
    }
  }

  process.exit(0);
} catch (error) {
  console.error(`SAM3 probe failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
