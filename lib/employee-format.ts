/**
 * 员工工作台的小工具函数（主干层）
 *
 * 职责：把后台任务阶段名翻译成员工看得懂的中文，以及安全解析 JSON。
 * 谁可以改：主干层；改完必须跑 `npm run verify`。
 * 依赖：无。
 * 被谁用：`components/employee-app.tsx` 的设计任务阶段列表等位置。
 * 验证方式：`npm run verify`。
 */

/**
 * 后台任务阶段 → 中文说法。
 *
 * 文案里不写具体供应商（原先写着 "OpenAI …"）：项目已改用 YZStudio 中转，
 * 供应商名字不应出现在用户可见文案里，否则每换一次中转都要改一遍界面。
 */
export function stageLabel(stage: string): string {
  const batchStage = stage.match(/^batch-(\d+)-(master|background|parts|cutout|rebuild)$/);
  if (batchStage) {
    const label = ({ master: "完整样片", background: "纯背景", parts: "零件拆解", cutout: "二次抠图", rebuild: "重建预览" } as Record<string, string>)[batchStage[2]] || "流水线";
    return `第 ${batchStage[1]} 份 · ${label}`;
  }
  if (stage.startsWith("retry-")) return `审美修正 · ${stageLabel(stage.slice(6))}`;
  const fallbackLabels: Record<string, string> = {
    image_text: "文生图",
    image_reference: "参考图生图",
    image_safety_fallback: "安全审核降级",
    image_summary_retry: "风格摘要生图",
    image_summary_result: "风格摘要生成完成",
    "asset-plan": "生产图层规划",
    background_text: "背景生图",
    background_reference: "参考图背景",
    background_safety_fallback: "背景安全降级",
    background_summary_retry: "背景摘要重试",
    hero_text: "主视觉生图",
    "production-ready": "可编辑生产预览",
    aesthetic: "审美评估",
    "aesthetic-retry": "审美修正",
    explode: "自动图片炸开",
    "background-clean": "背景清图",
    master_render: "完整样片",
    clean_background: "干净背景",
    layer_plan: "图层识别",
    semantic_cutout: "语义拆图",
    rebuild_qa: "重建检查",
    "reconstruction-qa": "重建检查",
    "apply-sync": "PPT 同步修复"
  };
  if (fallbackLabels[stage]) return fallbackLabels[stage];
  return ({ queued: "已排队", context: "整理上下文", vision: "参考理解", planner: "规划", image: "生图", apply: "写入 PPT", cancelled: "已取消", failed: "任务失败" } as Record<string, string>)[stage] || stage;
}

/** 解析 JSON，失败时返回兜底值（用于接口返回的 JSON 字符串字段） */
export function safeJson(value: string, fallback: unknown) { try { return JSON.parse(value); } catch { return fallback; } }
