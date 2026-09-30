/**
 * 员工工作台 API 客户端（主干层）
 *
 * 职责：集中保存「谁在调哪个接口、用什么方法、传什么 body」，让接口路径只存在一处。
 * 谁可以改：主干层，一次只允许一个人（或一个 agent）改；改完必须跑 `npm run verify`。
 * 依赖：无（只依赖浏览器 fetch）。
 * 被谁用：`components/employee-app.tsx` 及其后续拆分出的各个模块。
 * 验证方式：`npm run verify`；改完应保证 `employee-app.tsx` 内的 `fetch(` 只剩本文件之外 0 处。
 *
 * 约定：
 * - 这里只负责「发请求」。响应是否 ok、返回的 JSON 怎么用，仍然由调用方决定，
 *   以便逐步迁移时保持与原有 `const response = await fetch(...)` 完全一致的行为。
 * - GET 一律带 `cache: "no-store"`，与原实现保持一致。
 * - 需要 FormData 的接口传 `form`；需要 JSON body 的接口传普通对象，自动序列化。
 */

export type ApiBody = Record<string, unknown> | undefined;

const employeeBase = "/api/employee";

function request(path: string, init: RequestInit) {
  return fetch(path, init);
}

/** GET：只读接口，禁止缓存 */
function get(path: string) {
  return request(path, { cache: "no-store" });
}

/** POST：可传 FormData 或 JSON 对象；不传则为空 POST */
function post(path: string, payload?: FormData | ApiBody) {
  if (payload instanceof FormData) return request(path, { method: "POST", body: payload });
  if (payload === undefined) return request(path, { method: "POST" });
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/** PATCH：可传 FormData 或 JSON 对象 */
function patch(path: string, payload: FormData | ApiBody) {
  if (payload instanceof FormData) return request(path, { method: "PATCH", body: payload });
  return request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/* ------------------------------------------------------------------ *
 * 对外唯一入口：employeeApi
 *
 * 只导出一个对象，避免与组件内部同名变量（例如本地 state 叫作 deckRuns）
 * 发生遮蔽冲突；以后各模块统一 `import { employeeApi } from "@/lib/employee-api"`。
 * ------------------------------------------------------------------ */

export const employeeApi = {
  /* 会话与身份 */
  session: {
    /** 当前员工、订单、客户消息的总入口 */
    me: () => get(`${employeeBase}/me`),
    logout: () => post(`${employeeBase}/auth/logout`),
    /** 扫码登录参数；provider 为 "wechat" 或 "wecom" */
    loginConfig: (provider: string, query: string) => get(`${employeeBase}/auth/${provider}/config${query}`),
    /** 本地开发专用入口，生产环境服务端始终拒绝 */
    devLogin: (provider: string) => post(`${employeeBase}/auth/${provider}/dev`)
  },

  /* 管理控制台 */
  admin: {
    overview: () => get(`${employeeBase}/admin/overview`),
    updateMember: (membershipId: string, value: ApiBody) => patch(`${employeeBase}/admin/members/${membershipId}`, value)
  },

  /* 订单：状态、负责人、客户消息 */
  orders: {
    createWorkspace: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/workspace`, form),
    setStatus: (serviceId: string, body: { status: string; progress: number }) =>
      patch(`${employeeBase}/services/${serviceId}/status`, body),
    setAssignee: (serviceId: string, assigneeId: string | null) =>
      patch(`${employeeBase}/services/${serviceId}/assignee`, { assigneeId: assigneeId || null }),
    replyToCustomer: (consultationId: string, content: string) =>
      post(`${employeeBase}/consultations/${consultationId}/messages`, { content })
  },

  /* 工作文稿与版本 */
  documents: {
    config: (documentId: string) => get(`${employeeBase}/work-documents/${documentId}/config`),
    replace: (documentId: string, form: FormData) => post(`${employeeBase}/work-documents/${documentId}/replace`, form),
    saveVersion: (documentId: string, label: string) =>
      post(`${employeeBase}/work-documents/${documentId}/versions`, { label }),
    extractImages: (documentId: string, slideNumber: number) =>
      get(`${employeeBase}/work-documents/${documentId}/extract-images?slide=${encodeURIComponent(String(slideNumber))}`)
  },

  /* 生成 PPT（一次生成任务） */
  deck: {
    list: (serviceId: string) => get(`${employeeBase}/services/${serviceId}/deck-generation/runs`),
    create: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/deck-generation/runs`, form),
    confirm: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/confirm`),
    replan: (serviceId: string, runId: string, stylePack: string) =>
      post(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/replan`, { stylePack }),
    createPpt: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/ppt`),
    savePages: (serviceId: string, runId: string, body: ApiBody) =>
      patch(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/pages`, body),
    saveSettings: (serviceId: string, runId: string, form: FormData) =>
      patch(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/settings`, form),
    regenerateSlide: (serviceId: string, runId: string, slideId: string, body: ApiBody) =>
      post(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/slides/${slideId}/regenerate`, body),
    /** 生成 PDF：POST 触发，GET 下载（下载地址见 urls.deck.pdf） */
    createPdf: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/pdf`)
  },

  /* 美化 PPT（一次重绘任务） */
  polish: {
    list: (serviceId: string) => get(`${employeeBase}/services/${serviceId}/ppt-polish/runs`),
    create: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/ppt-polish/runs`, form),
    confirm: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/confirm`),
    addPageNotes: (serviceId: string, runId: string, body: ApiBody) =>
      post(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/page-notes`, body),
    cancel: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/cancel`),
    retry: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/retry`),
    createPpt: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/ppt`),
    regenerateSlide: (serviceId: string, runId: string, slideIndex: number, body: ApiBody) =>
      post(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/slides/${slideIndex}/regenerate`, body)
  },

  /* 单页智能设计 */
  design: {
    list: (serviceId: string) => get(`${employeeBase}/services/${serviceId}/design-agent/runs`),
    create: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/design-agent/runs`, form),
    update: (serviceId: string, runId: string, body: ApiBody) =>
      patch(`${employeeBase}/services/${serviceId}/design-agent/runs/${runId}`, body),
    cancel: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/design-agent/runs/${runId}/cancel`),
    apply: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/design-agent/runs/${runId}/apply`)
  },

  /* 图片炸开（组件拆图） */
  explode: {
    list: (serviceId: string) => get(`${employeeBase}/services/${serviceId}/image-explode/runs`),
    create: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/image-explode/runs`, form),
    update: (serviceId: string, runId: string, body: ApiBody) =>
      patch(`${employeeBase}/services/${serviceId}/image-explode/runs/${runId}`, body),
    cancel: (serviceId: string, runId: string) =>
      patch(`${employeeBase}/services/${serviceId}/image-explode/runs/${runId}`, { cancel: true }),
    apply: (serviceId: string, runId: string) =>
      post(`${employeeBase}/services/${serviceId}/image-explode/runs/${runId}/apply`),
    cleanText: (serviceId: string, runId: string, partId: string) =>
      post(`${employeeBase}/services/${serviceId}/image-explode/runs/${runId}/parts/${partId}/clean-text`),
    refine: (serviceId: string, runId: string, partId: string, body: ApiBody = {}) =>
      post(`${employeeBase}/services/${serviceId}/image-explode/runs/${runId}/parts/${partId}/refine`, body)
  },

  /* AI 助手 */
  ai: {
    conversation: (serviceId: string) => get(`${employeeBase}/services/${serviceId}/ai`),
    chat: (serviceId: string, body: { content: string; modelId: string }) =>
      post(`${employeeBase}/services/${serviceId}/ai/chat`, body),
    health: () => get(`${employeeBase}/ai/openai-health`)
  },

  /* 生图与素材库 */
  images: {
    list: (serviceId: string) => get(`${employeeBase}/services/${serviceId}/generate-images`),
    create: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/generate-images`, form),
    import: (serviceId: string, form: FormData) => post(`${employeeBase}/services/${serviceId}/import-image`, form),
    setMaterial: (imageId: string, body: { isMaterial: boolean; materialOrder: number }) =>
      patch(`${employeeBase}/generated-images/${imageId}`, body),
    /** 图片二进制读取（下载用 urls.image.download） */
    file: (imageId: string) => get(`${employeeBase}/generated-images/${imageId}`)
  },

  /* 图片工具与图片转 PPT */
  tools: {
    segmentation: (serviceId: string, form: FormData) =>
      post(`${employeeBase}/services/${serviceId}/image-tools/segmentation`, form),
    imageToPptx: (serviceId: string, form: FormData) =>
      post(`${employeeBase}/services/${serviceId}/image-to-pptx`, form)
  },

  /* 画面与下载地址（只拼字符串，不发请求） */
  urls: {
    image: {
      preview: (imageId: string) => `${employeeBase}/generated-images/${imageId}`,
      download: (imageId: string) => `${employeeBase}/generated-images/${imageId}?download=1`,
      absolute: (imageId: string) => {
        const path = `${employeeBase}/generated-images/${imageId}`;
        return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
      }
    },
    /** 图片炸开的候选部件；refined=1 取精修版 */
    explodePart: (partId: string, refined = false) =>
      `${employeeBase}/image-explode/parts/${partId}${refined ? "?refined=1" : ""}`,
    deck: {
      pdf: (serviceId: string, runId: string) => `${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/pdf`,
      ppt: (serviceId: string, runId: string) => `${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/ppt`,
      images: (serviceId: string, runId: string) => `${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/images`,
      slideImage: (serviceId: string, runId: string, slideId: string, updatedAt: string) =>
        withVersion(`${employeeBase}/services/${serviceId}/deck-generation/runs/${runId}/slides/${slideId}/image`, updatedAt)
    },
    polish: {
      pdf: (serviceId: string, runId: string) => `${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/pdf`,
      ppt: (serviceId: string, runId: string) => `${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/ppt`,
      sourcePageImage: (serviceId: string, runId: string, pageIndex: number, updatedAt: string) =>
        withVersion(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/source-pages/${pageIndex}`, updatedAt),
      slideImage: (serviceId: string, runId: string, slideIndex: number, updatedAt: string) =>
        withVersion(`${employeeBase}/services/${serviceId}/ppt-polish/runs/${runId}/slides/${slideIndex}/image`, updatedAt)
    },
    explode: {
      reconstruction: (serviceId: string, runId: string) =>
        `${employeeBase}/services/${serviceId}/image-explode/runs/${runId}/reconstruction`
    }
  }
};

/** 带版本戳的单页预览图地址，用于任务状态刷新后强制重新取图 */
function withVersion(path: string, updatedAt: string) {
  return `${path}?v=${encodeURIComponent(updatedAt)}`;
}
