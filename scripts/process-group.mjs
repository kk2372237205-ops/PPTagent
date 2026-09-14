import { spawnSync } from "child_process";

function asProcess(child) {
  return child?.process || child;
}

function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;

  if (process.platform === "win32") {
    const result = spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      { stdio: "ignore", shell: false, windowsHide: true }
    );
    if (result.status === 0) return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // The process may have exited between the status check and the kill call.
  }
}

export function superviseProcessGroup(children, label) {
  const processes = children.map(asProcess);
  let stopping = false;

  function stop(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    console.log(`Stopping ${label}...`);

    const exits = processes.map(child => child.exitCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once("exit", resolve)));

    processes.forEach(terminateProcessTree);

    const forceExit = setTimeout(() => process.exit(exitCode), 5_000);
    Promise.allSettled(exits).finally(() => {
      clearTimeout(forceExit);
      process.exit(exitCode);
    });
  }

  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  return {
    isStopping: () => stopping,
    stop
  };
}
