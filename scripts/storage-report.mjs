import { readdir, stat } from "fs/promises";
import path from "path";

const root = process.cwd();

async function sizeOf(target) {
  const info = await stat(target);
  if (!info.isDirectory()) return { bytes: info.size, files: 1, dirs: 0 };

  let bytes = 0;
  let files = 0;
  let dirs = 1;
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      const result = await sizeOf(child);
      bytes += result.bytes;
      files += result.files;
      dirs += result.dirs;
    } else if (entry.isFile()) {
      const info = await stat(child);
      bytes += info.size;
      files += 1;
    }
  }
  return { bytes, files, dirs };
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function reportTargets(title, names) {
  console.log(`\n${title}`);
  const rows = [];
  for (const name of names) {
    const target = path.join(root, name);
    if (!(await pathExists(target))) continue;
    const result = await sizeOf(target);
    rows.push({ name, ...result });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  for (const row of rows) {
    console.log(`${row.name.padEnd(28)} ${mb(row.bytes).padStart(12)}  ${String(row.files).padStart(6)} files  ${String(row.dirs).padStart(5)} dirs`);
  }
}

await reportTargets("Top-level storage", (await readdir(root, { withFileTypes: true })).map(entry => entry.name));

await reportTargets("Uploads breakdown", [
  "uploads/employee-workspace/documents",
  "uploads/employee-workspace/versions",
  "uploads/employee-workspace/images",
  "uploads/employee-workspace/references"
]);

console.log("\nSafe cleanup notes");
console.log("- Source code is small; storage is mostly uploads, Python environments, model caches, Git history, npm/Next caches.");
console.log("- Do not delete uploads if you still need old generated PPT/PDF/image previews.");
console.log("- .venv-sam3, .venv-image-gpu, and .models are optional local AI/image tooling assets.");
console.log("- node_modules, .npm-cache, .next, and .next-dev are reproducible caches/dependencies.");
console.log("- This script is read-only. It never deletes files.");

