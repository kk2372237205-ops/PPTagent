import { spawn, spawnSync } from "child_process";
import { closeSync, existsSync, openSync } from "fs";
import { createServer } from "net";
import path from "path";

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

function candidatePorts() {
  const requested = Number(process.env.DEV_PORT || process.env.PORT || 0);
  const defaults = [3000, 3001, ...Array.from({ length: 24 }, (_, index) => 3120 + index)];
  return [...new Set([requested, ...defaults].filter(port => Number.isInteger(port) && port > 0 && port < 65536))];
}

function canListen(port, host = "0.0.0.0") {
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

async function chooseDevPort() {
  for (const port of candidatePorts()) {
    if (await canListen(port)) return port;
  }
  throw new Error("找不到可用开发端口；请关闭占用端口的程序后重试。");
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

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.process.kill(signal));
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

children.forEach(child => {
  child.process.on("spawn", () => console.log(`${child.name} started.`));
  child.process.on("error", (error) => {
    console.error(`${child.name} failed to start: ${error.message}`);
    stop("SIGTERM");
    process.exit(1);
  });
  child.process.on("exit", (code) => {
    if (!stopping && code && code !== 0) {
      console.error(`${child.name} exited with code ${code}. Stopping lite development services.`);
      stop("SIGTERM");
      process.exit(code);
    }
  });
});
