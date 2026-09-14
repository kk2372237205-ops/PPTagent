import { existsSync, readFileSync, statSync } from "fs";
import path from "path";

const workerHeartbeatPath = path.join(process.cwd(), ".next-dev", "ppt-polish-worker-heartbeat.json");
const staleMs = 30_000;

export function pptPolishWorkerHealth() {
  try {
    if (!existsSync(workerHeartbeatPath)) {
      return {
        ok: false,
        message: "PPT 美化 Worker 未运行或尚未写入心跳，请重启 npm run dev:lite 或 npm run dev"
      };
    }

    const stat = statSync(workerHeartbeatPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const payload = JSON.parse(readFileSync(workerHeartbeatPath, "utf8"));
    const pid = Number(payload.pid || 0);
    const ok = ageMs < staleMs;

    return {
      ok,
      ageMs,
      pid,
      state: String(payload.state || "unknown"),
      updatedAt: String(payload.updatedAt || stat.mtime.toISOString()),
      message: ok ? "" : "PPT 美化 Worker 已停止响应，请重启 npm run dev:lite 或 npm run dev"
    };
  } catch {
    return {
      ok: false,
      message: "PPT 美化 Worker 状态读取失败，请重启 npm run dev:lite 或 npm run dev"
    };
  }
}
