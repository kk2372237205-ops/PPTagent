import { execFileSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

const root = process.cwd();
const grounded = path.join(root, ".venv-grounded-sam2", "Scripts", "python.exe");
const sam3 = path.join(root, ".venv-sam3", "Scripts", "python.exe");
const gpu = path.join(root, ".venv-image-gpu", "Scripts", "python.exe");
const python = process.env.GROUNDED_SAM2_PYTHON
  || process.env.COMPONENT_EXTRACTOR_PYTHON
  || (existsSync(grounded) ? grounded : (existsSync(sam3) ? sam3 : (existsSync(gpu) ? gpu : "python")));
const shouldLoadModel = process.argv.includes("--load");

const probe = [
  "import importlib.util, json, os, sys",
  "status = {'python': sys.executable}",
  "try:",
  " import torch, cv2, numpy",
  " status.update({",
  "  'torch': torch.__version__,",
  "  'cuda': str(torch.version.cuda or ''),",
  "  'cudaAvailable': bool(torch.cuda.is_available()),",
  "  'device': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,",
  "  'numpy': numpy.__version__,",
  "  'opencv': cv2.__version__,",
  "  'transformersInstalled': bool(importlib.util.find_spec('transformers')),",
  "  'groundingDinoInstalled': bool(importlib.util.find_spec('groundingdino')),",
  "  'sam2Installed': bool(importlib.util.find_spec('sam2')),",
  " })",
  " checkpoint = os.getenv('SAM2_CHECKPOINT') or ''",
  " model_cfg = os.getenv('SAM2_MODEL_CFG') or ''",
  " status.update({'checkpoint': checkpoint, 'checkpointReady': bool(checkpoint and os.path.exists(checkpoint)), 'modelCfg': model_cfg, 'modelCfgReady': bool(model_cfg and (os.path.exists(model_cfg) or model_cfg.startswith('configs/'))), 'grounder': os.getenv('GROUNDED_SAM2_GROUNDER', 'vision-boxes')})",
  " if status['sam2Installed']:",
  "  from sam2.build_sam import build_sam2",
  "  from sam2.sam2_image_predictor import SAM2ImagePredictor",
  "  status.update({'canImportBuilder': callable(build_sam2), 'canImportPredictor': callable(SAM2ImagePredictor)})",
  shouldLoadModel ? "  if not checkpoint or not model_cfg: raise RuntimeError('Set SAM2_CHECKPOINT and SAM2_MODEL_CFG before --load')" : "",
  shouldLoadModel ? "  device = 'cuda' if torch.cuda.is_available() else 'cpu'" : "",
  shouldLoadModel ? "  model = build_sam2(model_cfg, checkpoint, device=device)" : "",
  shouldLoadModel ? "  predictor = SAM2ImagePredictor(model)" : "",
  shouldLoadModel ? "  status.update({'modelLoadReady': True, 'modelDevice': device, 'predictorClass': predictor.__class__.__name__})" : "",
  "except Exception as error:",
  " status.update({'error': str(error)})",
  "print(json.dumps(status, ensure_ascii=False))",
].filter(Boolean).join("\n");

try {
  const output = execFileSync(python, ["-c", probe], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONWARNINGS: "ignore::FutureWarning" },
  }).trim();
  const status = JSON.parse(output || "{}");

  console.log(`Grounded-SAM2 probe python: ${status.python}`);
  console.log(`GPU ready: ${status.device || "no CUDA"} · PyTorch ${status.torch || "unknown"} · CUDA ${status.cuda || "none"}`);
  console.log(`Runtime deps: numpy ${status.numpy || "missing"} · OpenCV ${status.opencv || "missing"}`);
  console.log(`SAM2 package: ${status.sam2Installed ? "installed" : "missing"}`);
  console.log(`Optional grounding: transformers=${status.transformersInstalled ? "yes" : "no"} · groundingdino=${status.groundingDinoInstalled ? "yes" : "no"} · grounder=${status.grounder || "vision-boxes"}`);

  if (status.checkpointReady && status.modelCfgReady) {
    console.log(`SAM2 checkpoint ready: ${status.checkpoint}`);
    console.log(`SAM2 config ready: ${status.modelCfg}`);
  } else {
    console.log("SAM2 weights/config: not configured yet. Set SAM2_CHECKPOINT and SAM2_MODEL_CFG after installing SAM2 and downloading a public SAM2.1 checkpoint.");
  }

  if (status.error) {
    console.error(`Grounded-SAM2 check warning: ${status.error}`);
    if (shouldLoadModel) process.exit(1);
  }
  if (shouldLoadModel && status.modelLoadReady) {
    console.log(`Grounded-SAM2 model load ready: ${status.predictorClass} on ${status.modelDevice}`);
  }
  process.exit(0);
} catch (error) {
  console.error(`Grounded-SAM2 probe failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
