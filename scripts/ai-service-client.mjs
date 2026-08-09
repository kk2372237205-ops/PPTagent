import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

const agents = new Map();

export function aiTextConfig(env = process.env) {
  return {
    serviceName: trimEnv(env.AI_TEXT_SERVICE_NAME) || "YZStudio GPT-5.6 Sol",
    baseUrl: normalizeAiApiBaseUrl(env.AI_TEXT_BASE_URL),
    apiKey: trimEnv(env.AI_TEXT_API_KEY),
    model: trimEnv(env.AI_TEXT_MODEL) || "gpt-5.6-sol",
    apiMode: trimEnv(env.AI_TEXT_API_MODE) === "responses" ? "responses" : "chat-completions",
    proxyUrl: trimEnv(env.AI_TEXT_PROXY_URL)
  };
}

export function aiImageConfig(env = process.env) {
  return {
    serviceName: trimEnv(env.AI_IMAGE_SERVICE_NAME) || "YZStudio GPT Image 2",
    baseUrl: normalizeAiApiBaseUrl(env.AI_IMAGE_BASE_URL),
    apiKey: trimEnv(env.AI_IMAGE_API_KEY),
    model: trimEnv(env.AI_IMAGE_MODEL) || "gpt-image-2",
    size: trimEnv(env.AI_IMAGE_SIZE) || "1536x864",
    supportsEdits: trimEnv(env.AI_IMAGE_SUPPORTS_EDITS) === "1",
    proxyUrl: trimEnv(env.AI_IMAGE_PROXY_URL)
  };
}

export function createServiceFetch(config) {
  return async (url, init = {}, timeoutMs = 300000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Keep Undici's own first-byte and body timers behind the caller's overall
    // timeout. Otherwise its 300-second defaults can abort a permitted long task.
    const dispatcher = serviceAgent(config.proxyUrl, config.serviceName, timeoutMs + 5000);
    try {
      return await undiciFetch(url, { ...init, signal: controller.signal, dispatcher });
    } catch (error) {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      const timedOut = controller.signal.aborted;
      const reason = timedOut
        ? `请求超过 ${seconds} 秒，本机已停止等待`
        : externalErrorReason(error);
      const host = new URL(url).host;
      const route = config.proxyUrl ? "配置的专用代理" : "直连";
      const wrapped = new Error(`${config.serviceName} 无法通过${route}访问 ${host}：${reason}`, { cause: error });
      if (timedOut) wrapped.code = "AI_REQUEST_TIMEOUT";
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  };
}

function externalErrorReason(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error && typeof error === "object" ? error.cause : null;
  if (!cause || typeof cause !== "object") return message;
  const details = [cause.code, cause.message, cause.syscall]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  return details.length ? `${message} (${Array.from(new Set(details)).join(" · ")})` : message;
}

export function textEndpoint(config) {
  return `${config.baseUrl}/${config.apiMode === "responses" ? "responses" : "chat/completions"}`;
}

export function textRequestBody(config, input, options = {}) {
  if (config.apiMode === "responses") {
    return {
      model: config.model,
      input,
      ...(options.json ? { text: { format: { type: "json_object" } } } : {})
    };
  }
  return {
    model: config.model,
    messages: normalizeChatMessages(input),
    stream: false
  };
}

export function textFromResponse(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  const responseChunks = result?.output?.flatMap(item => item.content || [])
    .map(item => item.text || item.value || "")
    .filter(Boolean);
  if (responseChunks?.length) return responseChunks.join("\n").trim();
  const chatContent = result?.choices?.[0]?.message?.content;
  if (typeof chatContent === "string" && chatContent.trim()) return chatContent.trim();
  if (Array.isArray(chatContent)) {
    return chatContent.map(item => item?.text || "").filter(Boolean).join("\n").trim();
  }
  return "";
}

export function imageGenerationBody(config, prompt) {
  return {
    model: config.model,
    prompt,
    n: 1,
    size: config.size
  };
}

export function requireTextService(config) {
  if (!config.apiKey) throw new Error("尚未配置 AI_TEXT_API_KEY，文字中转服务不可用。");
}

export function requireImageService(config) {
  if (!config.apiKey) throw new Error("尚未配置 AI_IMAGE_API_KEY，图片中转服务不可用。");
}

export function requireImageEdits(config) {
  requireImageService(config);
  if (!config.supportsEdits) {
    throw new Error("当前图片中转站只配置了文生图接口，尚未接通参考图编辑接口。请移除参考图，或确认中转站支持 /images/edits 后设置 AI_IMAGE_SUPPORTS_EDITS=1。");
  }
}

function normalizeChatMessages(input) {
  if (Array.isArray(input) && input.every(item => item && typeof item === "object" && "role" in item)) {
    return input.map(item => ({
      role: item.role,
      content: normalizeChatContent(item.content)
    }));
  }
  return [{ role: "user", content: normalizeChatContent(input) }];
}

function normalizeChatContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content.map(item => {
    if (!item || typeof item !== "object") return { type: "text", text: String(item ?? "") };
    if (item.type === "input_image") {
      return { type: "image_url", image_url: { url: item.image_url || item.url || "" } };
    }
    if (item.type === "image_url") return item;
    return { type: "text", text: item.text || item.value || "" };
  });
}

function serviceAgent(proxyUrl, serviceName = "AI 服务", timeoutMs = 300000) {
  if (proxyUrl) assertProxyUrl(proxyUrl, serviceName);
  const key = `${proxyUrl || "direct"}:${timeoutMs}`;
  let agent = agents.get(key);
  if (!agent) {
    const options = { headersTimeout: timeoutMs, bodyTimeout: timeoutMs };
    agent = proxyUrl ? new ProxyAgent({ uri: proxyUrl, ...options }) : new Agent(options);
    agents.set(key, agent);
  }
  return agent;
}

function assertProxyUrl(proxyUrl, serviceName) {
  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error(`${serviceName} 的专用代理地址无效。无需代理时请将 *_PROXY_URL 留空。`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${serviceName} 的专用代理地址填写错误：*_PROXY_URL 只能填写代理服务器（例如 http://127.0.0.1:7897）；YZStudio 官网 https://yzstudio.vip 应填写在 *_BASE_URL。无需代理时请留空。`);
  }
}

export function normalizeAiApiBaseUrl(value) {
  const baseUrl = trimEnv(value) || "https://yzstudio.vip";
  return /\/v1$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

function trimEnv(value) {
  return String(value || "").replace(/^["']|["']$/g, "").trim().replace(/\/$/, "");
}

