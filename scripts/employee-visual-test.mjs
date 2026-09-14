import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const cwd = process.cwd();
const port = 3010;
const baseUrl = `http://127.0.0.1:${port}`;
mkdirSync(".artifacts", { recursive: true });

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)],
  {
    cwd,
    stdio: "pipe",
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-employee-visual",
      WECHAT_DEV_BYPASS: "1",
      WECHAT_CALLBACK_ORIGIN: baseUrl
    }
  }
);

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/employee`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Local server did not start.");
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/employee`, { waitUntil: "networkidle" });
  await page.screenshot({ path: ".artifacts/employee-login.png", fullPage: true });
  await page.getByRole("tab", { name: "企业微信" }).click();
  await page.waitForSelector("text=企业微信扫码登录尚未接通");
  await page.screenshot({ path: ".artifacts/employee-login-wecom.png", fullPage: true });
  await page.getByRole("tab", { name: "微信", exact: true }).click();
  await page.waitForSelector("text=本地开发：进入平台管理员");

  await page.getByRole("button", { name: "本地开发：进入平台管理员" }).click();
  await page.waitForSelector("text=把每一份托付", { timeout: 15000 });
  await page.screenshot({ path: ".artifacts/employee-orders.png", fullPage: false });
  await page.getByRole("button", { name: "管理控制台" }).click();
  await page.waitForSelector(".employee-member-row", { timeout: 10000 });
  await page.screenshot({ path: ".artifacts/employee-admin.png", fullPage: false });
  await page.getByRole("button", { name: "订单任务" }).click();
  const workspaceButtonCount = await page.getByRole("button", { name: /进入工作台/ }).count();

  const firstWorkspaceButton = page.getByRole("button", { name: /进入工作台/ }).first();
  await firstWorkspaceButton.click();
  await page.waitForSelector(".ppt-workspace", { timeout: 30000 });
  await page.waitForSelector("text=选择 PPT 文件");
  await page.screenshot({ path: ".artifacts/employee-workspace.png", fullPage: false });
  await page.getByRole("button", { name: /返回订单/ }).click();
  await page.waitForSelector("text=把每一份托付");
  await page.getByRole("button", { name: /进入工作台/ }).first().click();
  await page.waitForSelector(".ppt-workspace", { timeout: 15000 });
  const directReentry = await page.locator(".ppt-workspace").count();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto(`${baseUrl}/employee`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(2500);
  await mobile.screenshot({ path: ".artifacts/employee-mobile-block.png", fullPage: true });

  console.log(JSON.stringify({
    screenshots: [
      "employee-login.png",
      "employee-login-wecom.png",
      "employee-orders.png",
      "employee-admin.png",
      "employee-workspace.png",
      "employee-mobile-block.png"
    ],
    hasIntroduction: await page.getByText("服务介绍", { exact: true }).count(),
    hasPlans: await page.getByText("套餐服务", { exact: true }).count(),
    workspaceButtons: workspaceButtonCount,
    mobileDesktopNotice: await mobile.getByText("员工工作台仅支持电脑端").count(),
    directWorkspaceReentry: directReentry
  }, null, 2));
  await browser.close();
} finally {
  server.kill();
}
