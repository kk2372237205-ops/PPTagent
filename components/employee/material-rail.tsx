/* eslint-disable @next/next/no-img-element */
/**
 * 我的素材库 + 订单素材总库（可复用 UI 组件）
 *
 * 职责：底部素材栏。展示当前员工自己的素材，支持分页、拖入本地图片批量导入、
 *       把 AI 生成结果收进素材库、以及打开"订单素材总库"查看全部员工收录的素材。
 *       素材可以直接拖到 ONLYOFFICE 或 PPT 粘贴托盘里使用。
 * 谁可以改：本组件单独维护；改动不要顺手改智能模式或图片工具。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-image-urls`、
 *       `@/lib/employee-image-tools`、`./image-preview-modal`、`./ppt-paste-tray`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的订单工作台。
 * 验证方式：`npm run verify`；导入、分页、拖拽需在浏览器里人工确认。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ChevronLeft, ChevronRight, Download, ImagePlus, LoaderCircle, Upload, Users, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { Employee, MaterialItem, Service } from "@/lib/employee-api-types";
import { generatedImageDownloadUrl, generatedImageUrl } from "@/lib/employee-image-urls";
import { finishImageDrag, imageFilesFromList, readImageDragId, writeImageDragData } from "@/lib/employee-image-tools";
import { ImagePreviewModal, type ImagePreview } from "./image-preview-modal";
import { PptPasteTray } from "./ppt-paste-tray";

/** 新素材排在最后，用当前最大序号 +1 保证顺序稳定 */
function nextMaterialOrder(items: MaterialItem[]) {
  return items.reduce((max, item) => Math.max(max, item.materialOrder || 0), 0) + 1;
}

export function MaterialRail({ service, employee, refresh, notify }: {
  service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void;
}) {
  const [page, setPage] = useState(Number.MAX_SAFE_INTEGER);
  const [allPage, setAllPage] = useState(1);
  const [filterEmployeeId, setFilterEmployeeId] = useState("all");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const materialCountRef = useRef(0);
  const pageSize = 6;
  const allPageSize = 24;
  const myMaterials = useMemo(() => service.materialItems.filter(item => item.employee.id === employee.id).sort((a, b) => (a.materialOrder - b.materialOrder) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [employee.id, service.materialItems]);
  const totalPages = Math.max(1, Math.ceil(myMaterials.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = myMaterials.slice((safePage - 1) * pageSize, safePage * pageSize);
  const employees = useMemo(() => Array.from(new Map(service.materialItems.map(item => [item.employee.id, item.employee])).values()), [service.materialItems]);
  const allMaterials = useMemo(() => (filterEmployeeId === "all" ? service.materialItems : service.materialItems.filter(item => item.employee.id === filterEmployeeId)).slice().sort((a, b) => (a.materialOrder - b.materialOrder) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [filterEmployeeId, service.materialItems]);
  const allTotalPages = Math.max(1, Math.ceil(allMaterials.length / allPageSize));
  const safeAllPage = Math.min(allPage, allTotalPages);
  const allPageItems = allMaterials.slice((safeAllPage - 1) * allPageSize, safeAllPage * allPageSize);

  useEffect(() => {
    const previous = materialCountRef.current;
    materialCountRef.current = myMaterials.length;
    if (myMaterials.length <= previous) return;
    const timer = window.setTimeout(() => setPage(Number.MAX_SAFE_INTEGER), 0);
    return () => window.clearTimeout(timer);
  }, [myMaterials.length]);

  async function setMaterial(id: string, isMaterial: boolean, materialOrder = nextMaterialOrder(myMaterials), scope: "personal" | "project" = "personal") {
    const response = await employeeApi.images.setMaterial(id, { isMaterial, materialOrder, scope });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify(isMaterial ? scope === "project" ? "已共享到项目素材库" : "已加入我的个人素材库" : "已从我的个人素材库移除");
    if (isMaterial) setPage(Number.MAX_SAFE_INTEGER);
    await refresh(true);
  }

  async function importLocalImages(files: File[]) {
    const images = imageFilesFromList(files);
    if (!images.length) return notify("请拖入图片文件");
    setImporting(true);
    setImportProgress(images.length > 1 ? `正在导入 0 / ${images.length}` : "正在导入素材...");
    try {
      let imported = 0;
      for (const [index, file] of images.entries()) {
        setImportProgress(images.length > 1 ? `正在导入 ${index + 1} / ${images.length}` : "正在导入素材...");
        const form = new FormData();
        form.set("image", file);
        form.set("addToMaterial", "true");
        const response = await employeeApi.images.import(service.id, form);
        const result = await response.json();
        if (!response.ok) {
          notify(result.error || `${file.name} 导入失败`);
          continue;
        }
        imported += 1;
      }
      if (imported) notify(`已导入 ${imported} 张图片到我的素材库`);
      setPage(Number.MAX_SAFE_INTEGER);
      await refresh(true);
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const localImages = imageFilesFromList(event.dataTransfer.files);
    if (localImages.length) return void importLocalImages(localImages);
    const imageId = readImageDragId(event.dataTransfer);
    if (imageId) return void setMaterial(imageId, true);
    notify("请拖入 AI 图片、素材图片或本地图片文件。");
  }

  return <footer className={"material-rail " + (importing ? "is-importing" : "")} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={handleDrop}>
    <div><ImagePlus/><span><b>我的素材库</b><small>默认仅自己可见；可按需共享到项目</small></span><input ref={importRef} hidden type="file" accept="image/*" multiple onChange={event => { const files = imageFilesFromList(event.currentTarget.files || []); if (files.length) void importLocalImages(files); event.currentTarget.value = ""; }}/><button className="material-import-button" onClick={() => importRef.current?.click()} disabled={importing}><Upload/>导入图片</button></div>
    <section className="material-shelf">{pageItems.length ? pageItems.map(item => <article key={item.id} draggable onDragStartCapture={event => writeImageDragData(event, item.image.id, "material")} onDragEnd={finishImageDrag}><button className="material-thumb" onClick={() => setPreview({ id: item.image.id, prompt: item.image.job.prompt, owner: item.image.job.employee.name, model: item.image.job.model })}><img draggable={false} src={generatedImageUrl(item.image.id)} alt="我的素材"/></button><a href={generatedImageDownloadUrl(item.image.id)}><Download/></a><button onClick={() => setMaterial(item.image.id, false)}><X/></button></article>) : <p>把右侧生成结果或本地图片拖到这里，建立你的个人素材库。</p>}</section>
    <PptPasteTray notify={notify}/>
    <div className="material-pager"><button title="看更旧的素材" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}><ChevronLeft/></button><span>第 {safePage} / {totalPages} 页</span><button title="看更新的素材" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}><ChevronRight/></button><button className="material-open-all" onClick={() => setLibraryOpen(true)}>素材总库</button></div>
    {importing && <div className="material-importing"><LoaderCircle className="spin"/>{importProgress || "正在导入素材..."}</div>}
    {libraryOpen && <div className="material-modal"><div className="material-modal-card"><header><div><b>项目共享素材库</b><span>仅显示你的私有素材和已共享到本项目的素材；其他员工的私有素材不会出现。</span></div><button onClick={() => setLibraryOpen(false)}><X/></button></header><div className="material-filters"><button className={filterEmployeeId === "all" ? "active" : ""} onClick={() => { setFilterEmployeeId("all"); setAllPage(1); }}>全部</button>{employees.map(item => <button key={item.id} className={filterEmployeeId === item.id ? "active" : ""} onClick={() => { setFilterEmployeeId(item.id); setAllPage(1); }}>{item.name}</button>)}</div><section>{allPageItems.length ? allPageItems.map(item => { const owned = myMaterials.some(material => material.image.id === item.image.id); const canShare = item.employee.id === employee.id; return <article key={item.id} draggable onDragStartCapture={event => writeImageDragData(event, item.image.id, "material")} onDragEnd={finishImageDrag}><em>{item.scope === "project" ? `项目共享 · ${item.employee.name}` : item.employee.name}</em><button className="material-thumb" onClick={() => setPreview({ id: item.image.id, prompt: item.image.job.prompt, owner: item.employee.name, model: item.image.job.model })}><img draggable={false} src={generatedImageUrl(item.image.id)} alt={item.employee.name + " 的素材"}/></button><div><a href={generatedImageDownloadUrl(item.image.id)}><Download/></a>{canShare ? <button onClick={() => setMaterial(item.image.id, true, item.materialOrder, item.scope === "project" ? "personal" : "project")}><Users/>{item.scope === "project" ? "设为私有" : "共享项目"}</button> : <button disabled={owned} onClick={() => setMaterial(item.image.id, true)}><ImagePlus/>{owned ? "已在我的库" : "加入我的库"}</button>}</div></article>; }) : <p>当前筛选下暂无素材。</p>}</section><footer><button onClick={() => setAllPage(value => Math.min(allTotalPages, value + 1))} disabled={safeAllPage >= allTotalPages}><ChevronLeft/>更旧</button><span>第 {safeAllPage} / {allTotalPages} 页</span><button onClick={() => setAllPage(value => Math.max(1, value - 1))} disabled={safeAllPage <= 1}>更新<ChevronRight/></button></footer></div></div>}
    {preview && <ImagePreviewModal image={preview} onClose={() => setPreview(null)}/>}
  </footer>;
}
