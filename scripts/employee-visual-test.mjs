import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const cwd = process.cwd();
mkdirSync(".artifacts", { recursive: true });

const server = spawn(
  "C:\\node.exe",
  ["node_modules/next/dist/bin/next", "start", "-p", "3000"],
  { cwd, stdio: "pipe", windowsHide: true }
);

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3000/employee");
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
  await page.goto("http://127.0.0.1:3000/employee", { waitUntil: "networkidle" });
  await page.screenshot({ path: ".artifacts/employee-login.png", fullPage: true });

  await page.getByPlaceholder("请输入绑定手机号").fill("15875754338");
  await page.getByPlaceholder("8 位员工码").fill("12345678");
  await page.getByRole("button", { name: "获取短信验证码" }).click();
  const codeVisible = await page.getByPlaceholder("6 位验证码").waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
  if (!codeVisible) {
    await page.waitForTimeout(61000);
    await page.getByRole("button", { name: "获取短信验证码" }).click();
    await page.getByPlaceholder("6 位验证码").waitFor({ state: "visible", timeout: 5000 });
  }
  await page.getByPlaceholder("6 位验证码").fill("123456");
  await page.getByRole("button", { name: "验证并进入员工工作台" }).click();
  await page.waitForSelector("text=把每一份托付", { timeout: 15000 });
  await page.screenshot({ path: ".artifacts/employee-orders.png", fullPage: false });
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
  await mobile.goto("http://127.0.0.1:3000/employee", { waitUntil: "networkidle" });
  await mobile.waitForTimeout(2500);
  await mobile.screenshot({ path: ".artifacts/employee-mobile-block.png", fullPage: true });

  console.log(JSON.stringify({
    screenshots: [
      "employee-login.png",
      "employee-orders.png",
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
