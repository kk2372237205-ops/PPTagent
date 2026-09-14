import { spawn } from "child_process";
import { superviseProcessGroup } from "./process-group.mjs";

const children = [
  spawn(process.execPath, ["scripts/design-agent-worker.mjs"], { stdio: "inherit", shell: false }),
  spawn(process.execPath, ["scripts/deck-generation-worker.mjs"], { stdio: "inherit", shell: false }),
  spawn(process.execPath, ["scripts/ppt-polish-worker.mjs"], { stdio: "inherit", shell: false }),
  spawn(process.execPath, ["scripts/image-explode-worker.mjs"], { stdio: "inherit", shell: false })
];
const supervisor = superviseProcessGroup(children, "background task services");
children.forEach(child => child.on("exit", code => {
  if (!supervisor.isStopping() && code) supervisor.stop(code);
}));
