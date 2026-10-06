import { fetch as undiciFetch, ProxyAgent } from "undici";
import { AI_IMAGE_DISPLAY_NAME, AI_TEXT_DISPLAY_NAME } from "@/lib/employee-ai-labels";

export type AiProvider = "ark" | "openai";

export type AiModelOption = {
  id: string;
  provider: AiProvider;
  model: string;
  label: string;
  available: boolean;
  default?: boolean;
};

const ARK_RESPONSES_ENDPOINT = process.env.ARK_RESPONSES_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_TEXT_MODEL || "deepseek-v4-pro-260425";
const DOUBAO_MODEL = process.env.DOUBAO_TEXT_MODEL || "doubao-seed-2-0-pro-260215";
const DOUBAO_IMAGE_MODEL = process.env.DOUBAO_IMAGE_MODEL || "doubao-seedream-5-0-260128";
const serviceProxyAgents = new Map<string, ProxyAgent>();

export function textModelOptions() {
  const openAi = aiTextConfig();
  const defaultModel = process.env.DEFAULT_TEXT_MODEL || DEEPSEEK_MODEL;
  const options: AiModelOption[] = [
    {
      id: `ark:${DEEPSEEK_MODEL}`,
      provider: "ark",
      model: DEEPSEEK_MODEL,
      label: "DeepSeek V4 Pro",
      available: Boolean(process.env.ARK_API_KEY)
    },
    {
      id: `ark:${DOUBAO_MODEL}`,
      provider: "ark",
      model: DOUBAO_MODEL,
      label: "Doubao Seed 2.0 Pro",
      available: Boolean(process.env.ARK_API_KEY)
    },
    {
      id: `openai:${openAi.model}`,
      provider: "openai",
      model: openAi.model,
      label: AI_TEXT_DISPLAY_NAME,
      available: openAi.configured
    }
  ];
  return options.map(option => ({
    ...option,
    default: option.model === defaultModel || option.id === defaultModel
  }));
}

export function imageModelOptions() {
  const openAi = aiImageConfig();
  return [
    {
      id: `ark:${DOUBAO_IMAGE_MODEL}`,
      provider: "ark" as const,
      model: DOUBAO_IMAGE_MODEL,
      label: "Seedream 5.0",
      available: Boolean(process.env.ARK_API_KEY),
      default: true
    },
    {
      id: `openai:${openAi.model}`,
      provider: "openai" as const,
      model: openAi.model,
      label: AI_IMAGE_DISPLAY_NAME,
      available: openAi.configured
    }
  ];
}

export function defaultTextModelId() {
  return textModelOptions().find(option => option.default)?.id || `ark:${DEEPSEEK_MODEL}`;
}

export function resolveTextModel(id?: string | null) {
  const options = textModelOptions();
  return options.find(option => option.id === id) || options.find(option => option.default) || options[0];
}

export function resolveImageModel(id?: string | null) {
  const options = imageModelOptions();
  return options.find(option => option.id === id) || options[0];
}

export async function generateTextResponse(model: AiModelOption, input: string) {
  if (model.provider === "ark") {
    if (!process.env.ARK_API_KEY) throw new Error("尚未配置 ARK_API_KEY");
    const response = await fetchWithReadableNetworkError(ARK_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ARK_API_KEY}`
      },
      body: JSON.stringify({
        model: model.model,
        input: [{
          role: "user",
          content: [{ type: "input_text", text: input }]
        }]
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(readProviderError(result, "火山方舟文本生成失败"));
    return extractText(result);
  }

  const config = aiTextConfig();
  if (!config.apiKey) throw new Error("尚未配置 AI_TEXT_API_KEY");
  const isResponsesApi = config.apiMode === "responses";
  const response = await aiTextFetch(`${config.baseUrl}/${isResponsesApi ? "responses" : "chat/completions"}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(isResponsesApi
      ? { model: model.model, input }
      : { model: model.model, messages: [{ role: "user", content: input }], stream: false })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(readProviderError(result, "文字中转服务生成失败"));
  return extractText(result);
}

export async function aiTextFetch(url: string, init: RequestInit = {}, timeoutMs = 45000) {
  const config = aiTextConfig();
  return fetchWithReadableNetworkError(url, init, timeoutMs, getServiceProxyAgent(config.proxyUrl, "AI_TEXT"), "AI_TEXT");
}

export async function aiImageFetch(url: string, init: RequestInit = {}, timeoutMs = 300000) {
  const config = aiImageConfig();
  return fetchWithReadableNetworkError(url, init, timeoutMs, getServiceProxyAgent(config.proxyUrl, "AI_IMAGE"), "AI_IMAGE");
}

export function openAiDiagnosticsConfig() {
  const text = aiTextConfig();
  const image = aiImageConfig();
  return {
    text: publicServiceConfig(text),
    image: publicServiceConfig(image)
  };
}

export function aiTextConfig() {
  return {
    kind: "text" as const,
    serviceName: trimEnv(process.env.AI_TEXT_SERVICE_NAME) || "YZStudio GPT-5.6 Sol",
    baseUrl: normalizeAiApiBaseUrl(process.env.AI_TEXT_BASE_URL),
    apiKey: trimEnv(process.env.AI_TEXT_API_KEY),
    model: trimEnv(process.env.AI_TEXT_MODEL) || "gpt-5.6-sol",
    apiMode: trimEnv(process.env.AI_TEXT_API_MODE) === "responses" ? "responses" as const : "chat-completions" as const,
    proxyUrl: trimEnv(process.env.AI_TEXT_PROXY_URL),
    configured: Boolean(trimEnv(process.env.AI_TEXT_API_KEY))
  };
}

export function aiImageConfig() {
  return {
    kind: "image" as const,
    serviceName: trimEnv(process.env.AI_IMAGE_SERVICE_NAME) || "YZStudio GPT Image 2",
    baseUrl: normalizeAiApiBaseUrl(process.env.AI_IMAGE_BASE_URL),
    apiKey: trimEnv(process.env.AI_IMAGE_API_KEY),
    model: trimEnv(process.env.AI_IMAGE_MODEL) || "gpt-image-2",
    size: trimEnv(process.env.AI_IMAGE_SIZE) || "1536x864",
    supportsEdits: trimEnv(process.env.AI_IMAGE_SUPPORTS_EDITS) === "1",
    proxyUrl: trimEnv(process.env.AI_IMAGE_PROXY_URL),
    configured: Boolean(trimEnv(process.env.AI_IMAGE_API_KEY))
  };
}

function publicServiceConfig<T extends { apiKey: string; proxyUrl: string }>(config: T) {
  const safeConfig = { ...config };
  delete (safeConfig as { apiKey?: string }).apiKey;
  return { ...safeConfig, proxyConfigured: Boolean(config.proxyUrl) };
}

function getServiceProxyAgent(proxyUrl: string, configPrefix: "AI_TEXT" | "AI_IMAGE") {
  if (!proxyUrl) return undefined;
  assertServiceProxyUrl(proxyUrl, configPrefix);
  let agent = serviceProxyAgents.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    serviceProxyAgents.set(proxyUrl, agent);
  }
  return agent;
}

function assertServiceProxyUrl(proxyUrl: string, configPrefix: "AI_TEXT" | "AI_IMAGE") {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error(`${configPrefix}_PROXY_URL 无效。无需代理时请将它留空。`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${configPrefix}_PROXY_URL 只能填写代理服务器（例如 http://127.0.0.1:7897）；YZStudio 官网 https://yzstudio.vip 应填写在 ${configPrefix}_BASE_URL。无需代理时请留空。`);
  }
}

export function normalizeAiApiBaseUrl(value?: string) {
  const baseUrl = trimEnv(value) || "https://yzstudio.vip";
  return /\/v1$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

function trimEnv(value?: string) {
  return value?.replace(/^["']|["']$/g, "").trim().replace(/\/$/, "") || "";
}

export async function fetchWithReadableNetworkError(
  url: string,
  init: RequestInit,
  timeoutMs = 45000,
  dispatcher?: ProxyAgent,
  configPrefix = "AI_SERVICE"
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (dispatcher) {
      const undiciInit = { ...init, signal: controller.signal, dispatcher } as Parameters<typeof undiciFetch>[1];
      return await undiciFetch(url, undiciInit);
    }
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const host = new URL(url).host;
    const reason = networkErrorReason(error);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求 ${host} 超时。请检查 ${configPrefix}_BASE_URL；若中转站要求代理，再配置 ${configPrefix}_PROXY_URL。`);
    }
    const connectionHint = dispatcher
      ? `当前已走 ${configPrefix}_PROXY_URL；请确认代理软件开启、端口正确，并允许 Node.js 访问。`
      : `当前按要求直连中转站，未使用代理；请检查 ${configPrefix}_BASE_URL 和中转站状态。`;
    throw new Error(`无法连接 ${host}：${reason}。${connectionHint}`);
  } finally {
    clearTimeout(timer);
  }
}

function networkErrorReason(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    parts.push(cause.message);
  } else if (cause && typeof cause === "object") {
    const detail = cause as { code?: string; message?: string; syscall?: string; address?: string; port?: number };
    const extra = [detail.code, detail.syscall, detail.address, detail.port ? String(detail.port) : "", detail.message]
      .filter(Boolean)
      .join(" ");
    if (extra) parts.push(extra);
  }
  return Array.from(new Set(parts)).join("；");
}

export function readProviderError(result: unknown, fallback: string) {
  if (result && typeof result === "object") {
    const data = result as { error?: { code?: string; message?: string; type?: string }; message?: string };
    const message = data.error?.message || data.message;
    const code = data.error?.code || data.error?.type;
    if (message?.toLowerCase().includes("safety system")) {
      return "图片中转服务的安全系统拒绝了这个提示词。请改成原创角色或通用风格描述，避免直接使用现成 IP、角色名、标志或过于敏感的画面。";
    }
    return code ? `${message || fallback} (${code})` : message || fallback;
  }
  return fallback;
}

export function extractText(result: unknown) {
  if (result && typeof result === "object") {
    const data = result as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string; value?: string }> }>;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
    const chunks = data.output?.flatMap(item => item.content || [])
      .map(item => item.text || item.value || "")
      .filter(Boolean);
    if (chunks?.length) return chunks.join("\n").trim();
    const chatContent = data.choices?.[0]?.message?.content;
    if (typeof chatContent === "string" && chatContent.trim()) return chatContent.trim();
    if (Array.isArray(chatContent)) {
      const chatChunks = chatContent.map(item => item.text || "").filter(Boolean);
      if (chatChunks.length) return chatChunks.join("\n").trim();
    }
  }
  throw new Error("模型没有返回可读文本");
}
