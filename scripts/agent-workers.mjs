import { spawn } from "child_process";

const children = [
  spawn(process.execPath, ["scripts/design-agent-worker.mjs"], { stdio: "inherit", shell: false }),
  spawn(process.execPath, ["scripts/deck-generation-worker.mjs"], { stdio: "inherit", shell: false }),
  spawn(process.execPath, ["scripts/image-explode-worker.mjs"], { stdio: "inherit", shell: false })
];
let stopping = false;
function stop(signal) { if (!stopping) { stopping = true; children.forEach(child => child.kill(signal)); } }
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
children.forEach(child => child.on("exit", code => { if (!stopping && code) { stop("SIGTERM"); process.exit(code); } }));
