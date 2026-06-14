import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const cwd = process.cwd();
mkdirSync(".artifacts", { recursive: true });

const server = spawn(
  "C:\\node.exe",
  ["node_modules/next/dist/bin/next", "start", "-p", "3000"],
  { cwd, stdio: "pipe", windowsHide: true },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3000");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Local server did not start.");
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath:
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });

  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.screenshot({
    path: ".artifacts/client-cherry-login.png",
    fullPage: true,
  });

  await page.goto("http://127.0.0.1:3000/employee", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: ".artifacts/employee-navy-login.png",
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        screenshots: [
          "client-cherry-login.png",
          "employee-navy-login.png",
        ],
      },
      null,
      2,
    ),
  );
  await browser.close();
} finally {
  server.kill();
}
