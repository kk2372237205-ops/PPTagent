export type TechszImageToolId =
  | "segmentation"
  | "scale";

export type TechszImageTool = {
  id: TechszImageToolId;
  label: string;
  shortLabel: string;
  description: string;
  model: string;
  endpointPaths: string[];
  resultText: string;
};

export const techszImageTools: TechszImageTool[] = [
  {
    id: "segmentation",
    label: "智能抠图",
    shortLabel: "抠图",
    description: "保留原来的通用抠图能力，适合图片素材、徽章、产品图。",
    model: "visual/segmentation",
    endpointPaths: ["visual/segmentation"],
    resultText: "抠图完成，可以预览或存入我的素材库。"
  },
  {
    id: "scale",
    label: "图片变清晰",
    shortLabel: "变清晰",
    description: "提升普通图片清晰度。佐糖文档截图中对应 visual/scale。",
    model: "visual/scale",
    endpointPaths: ["visual/scale"],
    resultText: "图片变清晰完成，可以预览或存入我的素材库。"
  }
];

export function techszImageToolById(id: string) {
  return techszImageTools.find(tool => tool.id === id) || techszImageTools[0];
}
