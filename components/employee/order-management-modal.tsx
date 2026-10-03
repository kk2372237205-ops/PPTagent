/**
 * 平台管理员订单管理悬浮窗。
 *
 * 职责：新建、修改和二次确认删除一对一服务订单。
 * 谁可以改：本模块单独维护；权限必须由 `app/api/employee/admin/services/**` 再次验证。
 * 依赖：@/lib/employee-api、@/lib/employee-api-types、lucide-react。
 * 被谁用：./workbench-chrome。
 * 验证方式：npm run verify。
 */

import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { type OrderManagementDraft, type Service } from "@/lib/employee-api-types";

export type OrderManagementMode = "create" | "edit" | "delete";

const statuses = ["待开始", "制作中", "待客户确认", "修改中", "已完成"];

function localDateTime(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const offsetDate = new Date(safeDate.getTime() - safeDate.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function draftFromService(service?: Service): OrderManagementDraft {
  if (!service) {
    return {
      title: "",
      category: "PPT 定制",
      phone: "",
      priceCents: 0,
      status: "待开始",
      progress: 0,
      purchasedAt: localDateTime()
    };
  }
  return {
    title: service.title,
    category: service.category,
    phone: service.user.phone,
    priceCents: service.priceCents,
    status: service.status,
    progress: service.progress,
    purchasedAt: localDateTime(service.purchasedAt)
  };
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}）` };
  try { return JSON.parse(text) as { error?: string }; } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）` }; }
}

export function OrderManagementModal({ mode, service, onClose, onDone }: {
  mode: OrderManagementMode;
  service?: Service;
  onClose: () => void;
  onDone: (message: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(() => draftFromService(service));
  const [priceYuan, setPriceYuan] = useState(() => String(draftFromService(service).priceCents / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isDelete = mode === "delete";
  const isCreate = mode === "create";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  function update<K extends keyof OrderManagementDraft>(key: K, value: OrderManagementDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDelete) return;
    const priceCents = Math.round(Number(priceYuan) * 100);
    if (!Number.isFinite(priceCents)) return setError("请输入正确的订单金额");
    setBusy(true);
    setError("");
    const payload = { ...draft, priceCents };
    const response = isCreate
      ? await employeeApi.admin.createService(payload)
      : await employeeApi.admin.updateService(service!.id, payload);
    const result = await readResponse(response);
    setBusy(false);
    if (!response.ok) return setError(result.error || "订单保存失败");
    await onDone(isCreate ? "订单已新增，可继续派遣项目成员" : "订单信息已更新");
  }

  async function deleteOrder() {
    if (!service) return;
    setBusy(true);
    setError("");
    const response = await employeeApi.admin.deleteService(service.id);
    const result = await readResponse(response);
    setBusy(false);
    if (!response.ok) return setError(result.error || "订单删除失败");
    await onDone(`已删除订单「${service.title}」`);
  }

  const heading = isCreate ? "新增订单" : isDelete ? "删除订单" : "修改订单";
  const Icon = isCreate ? Plus : isDelete ? Trash2 : Pencil;
  return <div className="employee-order-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <section className={`employee-order-modal ${isDelete ? "is-danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="order-management-title">
      <header>
        <div className="employee-order-modal-heading"><span><Icon/></span><div><small>PLATFORM ORDER CONTROL</small><h2 id="order-management-title">{heading}</h2></div></div>
        <button type="button" className="employee-order-modal-close" onClick={onClose} disabled={busy} aria-label="关闭"><X/></button>
      </header>
      {isDelete ? <div className="employee-order-delete-confirmation">
        <p>这项操作不可撤销</p>
        <h3>{service?.title}</h3>
        <dl><div><dt>服务编号</dt><dd>{service?.number}</dd></div><div><dt>当前状态</dt><dd>{service?.status} · {service?.progress}%</dd></div></dl>
        <div className="employee-order-delete-note">订单及其数据库内的项目协作、生成记录和版本记录会一并删除；客户账户不会删除，本地已生成文件会保留为待清理项。</div>
        {error && <p className="employee-order-modal-error">{error}</p>}
        <footer><button type="button" className="employee-order-modal-secondary" disabled={busy} onClick={onClose}>取消</button><button type="button" className="employee-order-modal-danger" disabled={busy} onClick={() => void deleteOrder()}>{busy ? <LoaderCircle className="employee-order-modal-spin-icon"/> : <Trash2/>}确认删除订单</button></footer>
      </div> : <form onSubmit={(event) => void submit(event)}>
        <div className="employee-order-modal-form">
          <label className="wide"><span>订单名称</span><input value={draft.title} maxLength={120} onChange={(event) => update("title", event.target.value)} placeholder="例如：新能源品牌年度发布会" autoFocus/></label>
          <label><span>服务类型</span><input value={draft.category} maxLength={40} onChange={(event) => update("category", event.target.value)} placeholder="例如：PPT 定制"/></label>
          <label><span>客户手机号</span><input value={draft.phone} inputMode="numeric" maxLength={16} onChange={(event) => update("phone", event.target.value)} placeholder="用于关联客户账户"/></label>
          <label><span>订单金额（元）</span><input value={priceYuan} inputMode="decimal" onChange={(event) => { setPriceYuan(event.target.value); setError(""); }} placeholder="0.00"/></label>
          <label><span>下单时间</span><div className="employee-order-datetime"><CalendarDays/><input type="datetime-local" value={draft.purchasedAt} onChange={(event) => update("purchasedAt", event.target.value)}/></div></label>
          <label><span>订单状态</span><select value={draft.status} onChange={(event) => update("status", event.target.value)}>{statuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
          <label className="wide employee-order-progress-field"><span>完成进度 <b>{draft.status === "已完成" ? 100 : draft.progress}%</b></span><div><input type="range" min="0" max="100" step="1" disabled={draft.status === "已完成"} value={draft.status === "已完成" ? 100 : draft.progress} onChange={(event) => update("progress", Number(event.target.value))}/><input type="number" min="0" max="100" disabled={draft.status === "已完成"} value={draft.status === "已完成" ? 100 : draft.progress} onChange={(event) => update("progress", Number(event.target.value))}/></div></label>
        </div>
        {error && <p className="employee-order-modal-error">{error}</p>}
        <footer><button type="button" className="employee-order-modal-secondary" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="employee-order-modal-primary" disabled={busy}>{busy ? <LoaderCircle className="employee-order-modal-spin-icon"/> : <Icon/>}{isCreate ? "新增订单" : "保存修改"}</button></footer>
      </form>}
    </section>
  </div>;
}
