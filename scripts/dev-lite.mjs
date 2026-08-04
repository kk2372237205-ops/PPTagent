import { spawn, spawnSync } from "child_process";
import { closeSync, existsSync, openSync } from "fs";
import path from "path";
import { chooseDevPort } from "./dev-port.mjs";
import { superviseProcessGroup } from "./process-group.mjs";

function isBusyLockError(error) {
  return error?.code === "EBUSY" || error?.code === "EPERM";
}

function getExistingDevHint() {
  const lockPath = path.join(process.cwd(), ".next-dev", "dev", "lock");
  if (!existsSync(lockPath)) return null;

  try {
    const fd = openSync(lockPath, "r+");
    closeSync(fd);
    return null;
  } catch (error) {
    if (!isBusyLockError(error)) return null;
    return [
      "Another next dev server is already running for this project.",
      "Use the existing server instead of starting a second one.",
      "If you want to restart it, stop the old terminal first and then run npm run dev:lite again."
    ].join("\n");
  }
}


function runWhenMissing(label, markerPath, commandArgs) {
  if (existsSync(markerPath)) return;
  console.log(`${label} is missing. Preparing it once for dev:lite...`);
  const result = spawnSync(process.execPath, commandArgs, { stdio: "inherit", shell: false, cwd: process.cwd() });
  if (result.status !== 0) process.exit(result.status || 1);
}

const existingDevHint = getExistingDevHint();
if (existingDevHint) {
  console.error(existingDevHint);
  process.exit(1);
}

const prismaClient = path.join(process.cwd(), "node_modules", ".prisma", "client", "index.js");
runWhenMissing("Prisma client", prismaClient, ["node_modules/prisma/build/index.js", "generate"]);

const databaseFile = path.join(process.cwd(), "prisma", "dev.db");
runWhenMissing("SQLite database", databaseFile, ["scripts/init-db.mjs"]);

const port = await chooseDevPort();
const devEnv = {
  ...process.env,
  PORT: String(port),
  APP_INTERNAL_URL: `http://host.docker.internal:${port}`,
  APP_BASE_URL: `http://host.docker.internal:${port}`
};

console.log(`Lite development server will use http://localhost:${port}`);
console.log("dev:lite starts only Next, design-agent-worker, deck-generation-worker, and ppt-polish-worker.");
console.log("Use npm run dev when you need ONLYOFFICE checks or image-explode/component extraction.");

const children = [
  { name: "Next dev server", process: spawn(process.execPath, ["scripts/next-with-env-proxy.mjs", "dev"], { stdio: "inherit", shell: false, env: devEnv }) },
  { name: "Design agent worker", process: spawn(process.execPath, ["scripts/design-agent-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) },
  { name: "Deck generation worker", process: spawn(process.execPath, ["scripts/deck-generation-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) },
  { name: "PPT polish worker", process: spawn(process.execPath, ["scripts/ppt-polish-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) }
];

const supervisor = superviseProcessGroup(children, "lite development services");
children.forEach(child => {
  child.process.on("spawn", () => console.log(`${child.name} started.`));
  child.process.on("error", (error) => {
    console.error(`${child.name} failed to start: ${error.message}`);
    supervisor.stop(1);
  });
  child.process.on("exit", (code) => {
    if (!supervisor.isStopping() && code && code !== 0) {
      console.error(`${child.name} exited with code ${code}. Stopping lite development services.`);
      supervisor.stop(code);
    }
  });
});
