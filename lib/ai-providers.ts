import { fetch as undiciFetch, ProxyAgent } from "undici";

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
let openAiProxyAgent: ProxyAgent | undefined;
let openAiProxyAgentUrl = "";

export function textModelOptions() {
  const openAi = openAiConfig();
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
      id: `openai:${openAi.textModel}`,
      provider: "openai",
      model: openAi.textModel,
      label: "OpenAI",
      available: openAi.keyConfigured
    }
  ];
  return options.map(option => ({
    ...option,
    default: option.model === defaultModel || option.id === defaultModel
  }));
}

export function imageModelOptions() {
  const openAi = openAiConfig();
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
      id: `openai:${openAi.imageModel}`,
      provider: "openai" as const,
      model: openAi.imageModel,
      label: "OpenAI Image",
      available: openAi.keyConfigured
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

  if (!process.env.OPENAI_API_KEY) throw new Error("尚未配置 OPENAI_API_KEY");
  const response = await openAiFetch(`${openAiBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: model.model,
      input
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(readProviderError(result, "OpenAI 文本生成失败"));
  return extractText(result);
}

export async function openAiFetch(url: string, init: RequestInit = {}, timeoutMs = 45000) {
  return fetchWithReadableNetworkError(url, init, timeoutMs, getOpenAiProxyAgent());
}

export function openAiDiagnosticsConfig() {
  const openAi = openAiConfig();
  return {
    baseUrl: openAi.baseUrl,
    proxyUrl: openAi.proxyUrl,
    proxyConfigured: Boolean(openAi.proxyUrl),
    textModel: openAi.textModel,
    imageModel: openAi.imageModel,
    keyConfigured: openAi.keyConfigured
  };
}

export function openAiBaseUrl() {
  return openAiConfig().baseUrl;
}

function getOpenAiProxyAgent() {
  const { proxyUrl } = openAiConfig();
  if (!proxyUrl) return undefined;
  if (!openAiProxyAgent || openAiProxyAgentUrl !== proxyUrl) {
    openAiProxyAgent = new ProxyAgent(proxyUrl);
    openAiProxyAgentUrl = proxyUrl;
  }
  return openAiProxyAgent;
}

function openAiConfig() {
  return {
    baseUrl: trimEnv(process.env.OPENAI_BASE_URL) || "https://api.openai.com/v1",
    proxyUrl: trimEnv(process.env.OPENAI_PROXY_URL),
    textModel: trimEnv(process.env.OPENAI_TEXT_MODEL) || "gpt-5.5",
    imageModel: trimEnv(process.env.OPENAI_IMAGE_MODEL) || "gpt-image-1.5",
    keyConfigured: Boolean(trimEnv(process.env.OPENAI_API_KEY))
  };
}

function trimEnv(value?: string) {
  return value?.replace(/^["']|["']$/g, "").trim().replace(/\/$/, "") || "";
}

export async function fetchWithReadableNetworkError(url: string, init: RequestInit, timeoutMs = 45000, dispatcher?: ProxyAgent) {
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
      throw new Error(`请求 ${host} 超时。请检查本机网络、OPENAI_PROXY_URL 代理或 OPENAI_BASE_URL 配置；如果是生图任务，请稍后重试或简化提示词。`);
    }
    const proxyHint = dispatcher
      ? "当前已走 OPENAI_PROXY_URL 代理；请确认代理软件开启、端口正确，并允许 Node.js 访问。"
      : "当前未配置 OPENAI_PROXY_URL；如果本机无法直连 api.openai.com，请配置代理。";
    throw new Error(`无法连接 ${host}：${reason}。${proxyHint}也请检查 OPENAI_BASE_URL 是否正确。`);
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
      return "OpenAI 安全系统拒绝了这个图片提示词。请改成原创角色或通用风格描述，避免直接使用现成 IP、角色名、标志或过于敏感的画面。";
    }
    return code ? `${message || fallback} (${code})` : message || fallback;
  }
  return fallback;
}

export function extractText(result: unknown) {
  if (result && typeof result === "object") {
    const data = result as { output_text?: string; output?: Array<{ content?: Array<{ text?: string; value?: string }> }> };
    if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
    const chunks = data.output?.flatMap(item => item.content || [])
      .map(item => item.text || item.value || "")
      .filter(Boolean);
    if (chunks?.length) return chunks.join("\n").trim();
  }
  throw new Error("模型没有返回可读文本");
}
