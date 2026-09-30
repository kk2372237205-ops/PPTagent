import { createHash, createHmac, randomUUID } from "crypto";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import sharp from "sharp";

const sourceSnapshotVersion = 1;

function trimSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function encodeJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 10 * 60 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function conversionErrorMessage(code) {
  const messages = {
    "-1": "ONLYOFFICE 转换服务未知错误。",
    "-2": "ONLYOFFICE 转换服务超时。",
    "-3": "ONLYOFFICE 转换服务返回了错误的转换参数。",
    "-4": "ONLYOFFICE 无法下载本次美化任务的源 PPTX。",
    "-6": "ONLYOFFICE 无法识别源 PPTX 的格式。",
    "-7": "ONLYOFFICE 转换服务内部处理失败。",
    "-8": "ONLYOFFICE 转换服务令牌校验失败。"
  };
  return messages[String(code)] || `ONLYOFFICE 转换失败（错误码 ${code}）。`;
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false });
    const errors = [];
    child.stderr.on("data", chunk => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", code => code === 0
      ? resolve()
      : reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `${command} exited with ${code}`)));
  });
}

function pageNumberFromFileName(fileName) {
  return Number(String(fileName).match(/-(\d+)\.png$/i)?.[1] || 0);
}

async function renderPdfToPages(pdfPath, pageDirectory) {
  await mkdir(pageDirectory, { recursive: true });
  const pagePrefix = path.join(pageDirectory, "page");
  const pdfToPpm = process.env.PDFTOPPM_PATH || "pdftoppm";
  await run(pdfToPpm, ["-png", "-scale-to-x", "1920", "-scale-to-y", "-1", pdfPath, pagePrefix]);
  const files = (await readdir(pageDirectory))
    .filter(fileName => /^page-\d+\.png$/i.test(fileName))
    .sort((a, b) => pageNumberFromFileName(a) - pageNumberFromFileName(b));
  if (!files.length) throw new Error("PDF 已生成，但没有渲染出任何页面图片。");
  return Promise.all(files.map(async (fileName, index) => {
    const metadata = await sharp(path.join(pageDirectory, fileName)).metadata();
    return {
      pageIndex: index + 1,
      storedName: `source-pages/${fileName}`,
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || "png"
    };
  }));
}

/**
 * Produce local source-page snapshots for one PPT polish task.
 *
 * The source page PNGs are intentionally kept inside the task directory. This
 * stage only renders the customer file locally; it never calls Image2.
 */
export async function createPptPolishSourcePages({ run, sourcePath, sourceUrl, runRoot, onlyOfficeUrl, onlyOfficeSecret }) {
  if (!sourcePath || !sourceUrl) throw new Error("源 PPTX 路径或 ONLYOFFICE 可访问地址缺失。");
  const taskDirectory = path.join(runRoot, path.basename(run.id));
  const pageDirectory = path.join(taskDirectory, "source-pages");
  const sourcePdfPath = path.join(taskDirectory, "source.pdf");
  const manifestPath = path.join(taskDirectory, "source-pages-manifest.json");
  await mkdir(taskDirectory, { recursive: true });

  const sourceBuffer = await readFile(sourcePath);
  const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex");
  const converterBaseUrl = trimSlash(onlyOfficeUrl || process.env.PPT_POLISH_ONLYOFFICE_URL || process.env.ONLYOFFICE_URL || "http://localhost:18080");
  const converterRequest = {
    async: false,
    filetype: "pptx",
    key: `ppt-polish-${run.id}-${randomUUID().slice(0, 8)}`.slice(0, 120),
    outputtype: "pdf",
    title: run.sourceName || "source.pptx",
    url: sourceUrl
  };
  const token = encodeJwt(converterRequest, onlyOfficeSecret || process.env.ONLYOFFICE_JWT_SECRET || "development-onlyoffice-secret");
  const converterResponse = await fetch(`${converterBaseUrl}/converter?shardkey=${encodeURIComponent(converterRequest.key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ ...converterRequest, token })
  });
  const converterPayload = await converterResponse.json().catch(() => ({}));
  if (!converterResponse.ok || converterPayload.error) {
    throw new Error(conversionErrorMessage(converterPayload.error || converterResponse.status));
  }
  if (!converterPayload.endConvert || !converterPayload.fileUrl) {
    throw new Error("ONLYOFFICE 尚未完成页面快照转换，请稍后重新确认美化任务。");
  }

  const convertedPdf = await fetch(converterPayload.fileUrl);
  if (!convertedPdf.ok) throw new Error(`无法下载 ONLYOFFICE 生成的 PDF（HTTP ${convertedPdf.status}）。`);
  await writeFile(sourcePdfPath, Buffer.from(await convertedPdf.arrayBuffer()));
  const pages = await renderPdfToPages(sourcePdfPath, pageDirectory);
  const now = new Date().toISOString();
  const manifest = {
    version: sourceSnapshotVersion,
    createdAt: now,
    sourceName: run.sourceName,
    sourceHash,
    sourcePdf: "source.pdf",
    pageCount: pages.length,
    pages
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ...manifest, manifest: path.relative(runRoot, manifestPath).replace(/\\/g, "/") };
}
