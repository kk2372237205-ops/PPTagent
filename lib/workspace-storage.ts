import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile, copyFile } from "fs/promises";
import path from "path";

export const workspaceRoot = path.join(process.cwd(), "uploads", "employee-workspace");
export const documentRoot = path.join(workspaceRoot, "documents");
export const versionRoot = path.join(workspaceRoot, "versions");
export const imageRoot = path.join(workspaceRoot, "images");
export const referenceRoot = path.join(workspaceRoot, "references");
export const deckGenerationRoot = path.join(workspaceRoot, "deck-generation");
export const deckSourceRoot = path.join(deckGenerationRoot, "sources");
export const deckThemeRoot = path.join(deckGenerationRoot, "themes");
export const deckEvidenceRoot = path.join(deckGenerationRoot, "evidence");

export async function ensureWorkspaceDirectories() {
  await Promise.all([
    mkdir(documentRoot, { recursive: true }),
    mkdir(versionRoot, { recursive: true }),
    mkdir(imageRoot, { recursive: true }),
    mkdir(referenceRoot, { recursive: true }),
    mkdir(deckSourceRoot, { recursive: true }),
    mkdir(deckThemeRoot, { recursive: true }),
    mkdir(deckEvidenceRoot, { recursive: true })
  ]);
}

export function uniqueStoredName(extension: string) {
  return `${Date.now()}-${randomBytes(12).toString("hex")}.${extension.replace(/^\./, "")}`;
}

export async function saveFile(file: File, directory: string, extension?: string) {
  await ensureWorkspaceDirectories();
  const ext = extension || path.extname(file.name).slice(1).toLowerCase();
  const storedName = uniqueStoredName(ext || "bin");
  await writeFile(path.join(directory, storedName), Buffer.from(await file.arrayBuffer()));
  return storedName;
}

export async function copyStoredFile(sourceDirectory: string, sourceName: string, targetDirectory: string, extension: string) {
  await ensureWorkspaceDirectories();
  const storedName = uniqueStoredName(extension);
  await copyFile(path.join(sourceDirectory, sourceName), path.join(targetDirectory, storedName));
  return storedName;
}

export async function readStoredFile(directory: string, storedName: string) {
  return readFile(path.join(directory, path.basename(storedName)));
}
