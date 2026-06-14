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
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.screenshot({ path: ".artifacts/login.png", fullPage: true });

  await page.getByPlaceholder("请输入手机号码").fill("13700000000");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByPlaceholder("6 位验证码").fill("123456");
  await page.getByRole("button", { name: "验证并进入工作台" }).click();
  await page.waitForSelector("text=让内容拥有更好的表达", { timeout: 15000 });
  await page.screenshot({ path: ".artifacts/introduction.png", fullPage: true });

  await page.getByRole("button", { name: /套餐服务/ }).click();
  await page.waitForSelector("text=选择适合你的服务尺度");
  await page.screenshot({ path: ".artifacts/plans.png", fullPage: true });
  await page.locator(".budget-card").first().click();
  await page.getByPlaceholder(/描述你的用途/).fill("用于新品发布会，预计 24 页，下周五交付。");
  await page.locator(".send-button").click();
  await page.waitForSelector("text=用于新品发布会");

  await page.getByRole("button", { name: /服务交付/ }).click();
  await page.waitForSelector("text=每一次托付");
  await page.screenshot({ path: ".artifacts/delivery.png", fullPage: true });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "保存为资产" }).click();
  await page.waitForSelector("text=已存为资产");

  await page.getByRole("button", { name: "资产", exact: true }).click();
  await page.waitForSelector("text=1 个作品资产");
  await page.screenshot({ path: ".artifacts/assets.png", fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await mobile.screenshot({ path: ".artifacts/mobile-login.png", fullPage: true });

  console.log(JSON.stringify({
    title: await page.title(),
    screenshots: ["login.png", "introduction.png", "plans.png", "delivery.png", "assets.png", "mobile-login.png"],
    bodyOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  }, null, 2));
  await browser.close();
} finally {
  server.kill();
}
