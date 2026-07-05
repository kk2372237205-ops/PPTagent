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
      "If you want to restart it, stop the old terminal first and then run npm run dev again."
    ].join("\n");
  }
}

const existingDevHint = getExistingDevHint();
if (existingDevHint) {
  console.error(existingDevHint);
  process.exit(1);
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

function componentExtractorPorts() {
  const requested = Number(process.env.COMPONENT_EXTRACTOR_PORT || 0);
  const defaults = [
    8765, 8766, 8767,
    ...Array.from({ length: 20 }, (_, index) => 8780 + index),
    ...Array.from({ length: 30 }, (_, index) => 48100 + index)
  ];
  return [...new Set([requested, ...defaults].filter(port => Number.isInteger(port) && port > 0 && port < 65536))];
}

async function chooseComponentExtractorPort() {
  for (const port of componentExtractorPorts()) {
    if (await canListen(port, "127.0.0.1")) return port;
  }
  return null;
}

const port = await chooseDevPort();
const componentExtractorPort = await chooseComponentExtractorPort();
// Calling npx.cmd with shell:false can silently fail on Windows. Invoke Prisma's
// local JavaScript entry point through the current Node runtime instead.
const prisma = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate"], { stdio: "inherit", shell: false, cwd: process.cwd() });
if (prisma.status !== 0) {
  const existingQueryEngine = path.join(process.cwd(), "node_modules", ".prisma", "client", "query_engine-windows.dll.node");
  if (process.platform === "win32" && existsSync(existingQueryEngine)) {
    console.warn("Prisma generate could not replace the Windows query engine, probably because an existing dev/worker process is using it.");
    console.warn("Continuing with the existing generated Prisma client. Stop old node processes if Prisma schema changes are not reflected.");
  } else {
    process.exit(prisma.status || 1);
  }
}
const database = spawnSync(process.execPath, ["scripts/init-db.mjs"], { stdio: "inherit", shell: false, cwd: process.cwd() });
if (database.status !== 0) process.exit(database.status || 1);
const devEnv = {
  ...process.env,
  PORT: String(port),
  APP_INTERNAL_URL: `http://host.docker.internal:${port}`,
  APP_BASE_URL: `http://host.docker.internal:${port}`,
  ...(componentExtractorPort
    ? {
        COMPONENT_EXTRACTOR_PORT: String(componentExtractorPort),
        COMPONENT_EXTRACTOR_URL: `http://127.0.0.1:${componentExtractorPort}`
      }
    : {})
};
console.log(`Development server will use http://localhost:${port}`);
if (componentExtractorPort) {
  console.log(`Component extractor will use http://127.0.0.1:${componentExtractorPort}`);
} else {
  console.warn("No available component extractor port was found. Legacy image-explode extraction will be unavailable in this dev session.");
}

const children = [
  { name: "Next dev server", process: spawn(process.execPath, ["scripts/next-with-env-proxy.mjs", "dev"], { stdio: "inherit", shell: false, env: devEnv }) },
  { name: "Design agent worker", process: spawn(process.execPath, ["scripts/design-agent-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) },
  { name: "Deck generation worker", process: spawn(process.execPath, ["scripts/deck-generation-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) },
  { name: "PPT polish worker", process: spawn(process.execPath, ["scripts/ppt-polish-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) },
  ...(componentExtractorPort ? [{ name: "Component extractor worker", process: spawn(process.execPath, ["scripts/component-extractor.mjs"], { stdio: "inherit", shell: false, env: devEnv }) }] : []),
  { name: "Image explode worker", process: spawn(process.execPath, ["scripts/image-explode-worker.mjs"], { stdio: "inherit", shell: false, env: devEnv }) }
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
    console.error(`${child.name} exited with code ${code}. Stopping development services.`);
    stop("SIGTERM");
    process.exit(code);
  }
  });
});
