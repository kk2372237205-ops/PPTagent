import { existsSync } from "fs";
import { spawn } from "child_process";

const composeFile = "docker-compose.onlyoffice.yml";
const onlyofficeUrl = process.env.ONLYOFFICE_PUBLIC_URL || process.env.ONLYOFFICE_URL || "http://localhost:18080";
const apiScriptUrl = `${onlyofficeUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.silent ? "pipe" : "inherit",
      windowsHide: true
    });
    let output = "";
    if (child.stdout) child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    if (child.stderr) child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function dockerReady() {
  try {
    await run("docker", ["info", "--format", "{{.ServerVersion}}"], { silent: true });
    return true;
  } catch {
    return false;
  }
}

async function onlyofficeReady() {
  try {
    const response = await fetch(apiScriptUrl);
    return response.ok;
  } catch {
    return false;
  }
}

function findDockerDesktop() {
  const candidates = [
    process.env.DOCKER_DESKTOP_PATH,
    "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
    "C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function startDockerDesktop() {
  if (process.platform !== "win32") {
    console.log("Docker is not running. Please start Docker Desktop, then run this command again.");
    return false;
  }

  const dockerDesktopPath = findDockerDesktop();
  if (!dockerDesktopPath) {
    console.log("Docker Desktop was not found. Install or start Docker Desktop, then run this command again.");
    return false;
  }

  console.log("Docker is not ready. Starting Docker Desktop...");
  const child = spawn(dockerDesktopPath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return true;
}

async function waitForDocker() {
  if (await dockerReady()) return true;
  if (await onlyofficeReady()) return false;
  if (!startDockerDesktop()) process.exit(1);

  for (let attempt = 1; attempt <= 150; attempt += 1) {
    if (await dockerReady()) {
      console.log("Docker is ready.");
      return true;
    }
    if (await onlyofficeReady()) {
      console.log(`ONLYOFFICE is already ready at ${onlyofficeUrl}`);
      return false;
    }
    if (attempt % 10 === 0) console.log("Still waiting for Docker Desktop...");
    await sleep(2000);
  }

  throw new Error("Docker Desktop did not become ready within 5 minutes.");
}

async function waitForOnlyOffice() {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    if (await onlyofficeReady()) {
      console.log(`ONLYOFFICE is ready at ${onlyofficeUrl}`);
      return;
    }
    if (attempt % 10 === 0) console.log("Waiting for ONLYOFFICE document server...");
    await sleep(2000);
  }

  throw new Error(`ONLYOFFICE did not become ready at ${onlyofficeUrl}.`);
}

if (await onlyofficeReady()) {
  console.log(`ONLYOFFICE is already ready at ${onlyofficeUrl}`);
  process.exit(0);
}

const shouldRunCompose = await waitForDocker();
if (shouldRunCompose) await run("docker", ["compose", "-f", composeFile, "up", "-d"]);
await waitForOnlyOffice();
