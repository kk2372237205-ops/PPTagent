import { execFileSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

const root = process.cwd();
const bundledSam3 = path.join(root, ".venv-sam3", "Scripts", "python.exe");
const bundledGpu = path.join(root, ".venv-image-gpu", "Scripts", "python.exe");
const python = process.env.COMPONENT_EXTRACTOR_PYTHON || (existsSync(bundledSam3) ? bundledSam3 : (existsSync(bundledGpu) ? bundledGpu : "python"));
const probe = [
  "import json",
  "try:",
  " import torch",
  " print(json.dumps({'python': __import__('sys').executable, 'torch': torch.__version__, 'cudaAvailable': bool(torch.cuda.is_available()), 'cuda': torch.version.cuda, 'device': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}, ensure_ascii=False))",
  "except Exception as error:",
  " print(json.dumps({'error': str(error)}, ensure_ascii=False))"
].join("\n");

try {
  const output = execFileSync(python, ["-c", probe], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const status = JSON.parse(output || "{}");
  if (status.cudaAvailable) {
    console.log(`GPU ready: ${status.device} · PyTorch ${status.torch} · CUDA ${status.cuda}`);
    process.exit(0);
  }
  console.error(`GPU not ready: ${status.error || `PyTorch ${status.torch || "is not installed"} cannot access CUDA`}`);
  process.exit(1);
} catch (error) {
  console.error(`GPU probe failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
