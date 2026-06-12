"use client";

import { useState, useTransition, useCallback } from "react";
import { auditHeaders } from "../lib/audit-headers";

/* ── Types ─────────────────────────────────────────────────────── */
interface Category {
  id: string;
  code: string;
  name: string;
  nameEn?: string | null;
  icon?: string | null;
  colorHex?: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { procedures: number };
}

interface Procedure {
  id: string;
  code: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  legalBasis?: string | null;
  processingAgency?: string | null;
  categoryId: string;
  category?: Category | null;
  slaWorkDays: number;
  fee?: string | number | null;
  feeNote?: string | null;
  isOnline: boolean;
  isActive: boolean;
  _count?: { applications: number; requirements: number };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...auditHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

/* ── Slide Panel ───────────────────────────────────────────────── */
function SlidePanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>
  );
}

/* ── Confirm Dialog ────────────────────────────────────────────── */
function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-sm text-slate-700">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Huỷ
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Đang xoá…" : "Xoá"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Field helpers ─────────────────────────────────────────────── */
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

/* ── Procedure Form ────────────────────────────────────────────── */
function ProcedureForm({
  initial,
  categories,
  onSave,
  onCancel,
}: {
  initial?: Partial<Procedure>;
  categories: Category[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    nameEn: initial?.nameEn ?? "",
    categoryId: initial?.categoryId ?? (categories[0]?.id ?? ""),
    slaWorkDays: initial?.slaWorkDays ?? 5,
    fee: initial?.fee != null ? Number(initial.fee) : "",
    feeNote: initial?.feeNote ?? "",
    processingAgency: initial?.processingAgency ?? "",
    legalBasis: initial?.legalBasis ?? "",
    description: initial?.description ?? "",
    isOnline: initial?.isOnline ?? true,
    isActive: initial?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(k: string, v: unknown) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await onSave({
        ...form,
        fee: form.fee === "" ? undefined : Number(form.fee),
        slaWorkDays: Number(form.slaWorkDays),
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Row: Code + Category */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Mã thủ tục" required>
          <input
            className={inputCls}
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            required
            placeholder="VD: KHAISINH"
          />
        </Field>
        <Field label="Danh mục" required>
          <select
            className={inputCls}
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Tên thủ tục (tiếng Việt)" required>
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
          placeholder="VD: Đăng ký khai sinh"
        />
      </Field>

      <Field label="Tên tiếng Anh">
        <input
          className={inputCls}
          value={form.nameEn ?? ""}
          onChange={(e) => set("nameEn", e.target.value)}
          placeholder="VD: Birth registration"
        />
      </Field>

      {/* Row: SLA + Fee */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="SLA (ngày làm việc)" required>
          <input
            className={inputCls}
            type="number"
            min={1}
            max={365}
            value={form.slaWorkDays}
            onChange={(e) => set("slaWorkDays", e.target.value)}
            required
          />
        </Field>
        <Field label="Lệ phí (VNĐ)">
          <input
            className={inputCls}
            type="number"
            min={0}
            value={form.fee}
            onChange={(e) => set("fee", e.target.value)}
            placeholder="0 = Miễn phí"
          />
        </Field>
      </div>

      <Field label="Ghi chú lệ phí">
        <input
          className={inputCls}
          value={form.feeNote ?? ""}
          onChange={(e) => set("feeNote", e.target.value)}
          placeholder="VD: Miễn phí với hộ nghèo"
        />
      </Field>

      <Field label="Cơ quan xử lý">
        <input
          className={inputCls}
          value={form.processingAgency ?? ""}
          onChange={(e) => set("processingAgency", e.target.value)}
          placeholder="VD: UBND Phường"
        />
      </Field>

      <Field label="Căn cứ pháp lý">
        <input
          className={inputCls}
          value={form.legalBasis ?? ""}
          onChange={(e) => set("legalBasis", e.target.value)}
          placeholder="VD: Nghị định 123/2015/NĐ-CP"
        />
      </Field>

      <Field label="Mô tả">
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Mô tả ngắn về thủ tục…"
        />
      </Field>

      {/* Toggles */}
      <div className="flex gap-6">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isOnline}
            onChange={(e) => set("isOnline", e.target.checked)}
            className="h-4 w-4 rounded accent-blue-600"
          />
          <span className="font-medium text-slate-700">Nộp trực tuyến</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="h-4 w-4 rounded accent-blue-600"
          />
          <span className="font-medium text-slate-700">Đang hoạt động</span>
        </label>
      </div>

      {err && (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600">{err}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu thủ tục"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

/* ── Category Form ─────────────────────────────────────────────── */
function CategoryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Category>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    nameEn: initial?.nameEn ?? "",
    icon: initial?.icon ?? "",
    colorHex: initial?.colorHex ?? "#3B82F6",
    sortOrder: initial?.sortOrder ?? 0,
    isActive: initial?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(k: string, v: unknown) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await onSave({ ...form, sortOrder: Number(form.sortOrder) });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Mã danh mục" required>
          <input
            className={inputCls}
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            required
            placeholder="VD: HOCUC"
          />
        </Field>
        <Field label="Thứ tự hiển thị">
          <input
            className={inputCls}
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Tên danh mục" required>
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
          placeholder="VD: Hộ tịch"
        />
      </Field>

      <Field label="Tên tiếng Anh">
        <input
          className={inputCls}
          value={form.nameEn ?? ""}
          onChange={(e) => set("nameEn", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Icon (emoji/text)">
          <input
            className={inputCls}
            value={form.icon ?? ""}
            onChange={(e) => set("icon", e.target.value)}
            placeholder="VD: 📋"
          />
        </Field>
        <Field label="Màu sắc (HEX)">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.colorHex ?? "#3B82F6"}
              onChange={(e) => set("colorHex", e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 p-0.5"
            />
            <input
              className={`${inputCls} flex-1`}
              value={form.colorHex ?? ""}
              onChange={(e) => set("colorHex", e.target.value)}
              placeholder="#3B82F6"
            />
          </div>
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          className="h-4 w-4 rounded accent-blue-600"
        />
        <span className="font-medium text-slate-700">Đang hoạt động</span>
      </label>

      {err && (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600">{err}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu danh mục"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

/* ── Tab selector ──────────────────────────────────────────────── */
type Tab = "procedures" | "categories";

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Client Component                                             */
/* ═══════════════════════════════════════════════════════════════════ */
export function ProceduresClient({
  initialProcedures,
  initialCategories,
}: {
  initialProcedures: Procedure[];
  initialCategories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("procedures");
  const [procedures, setProcedures] = useState(initialProcedures);
  const [categories, setCategories] = useState(initialCategories);

  // ── Search / filter ──────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");

  // ── Panel state ──────────────────────────────────────────────
  type PanelMode = "none" | "add-procedure" | "edit-procedure" | "add-category" | "edit-category";
  const [panel, setPanel] = useState<PanelMode>("none");
  const [editProc, setEditProc] = useState<Procedure | null>(null);
  const [editCat, setEditCat] = useState<Category | null>(null);

  // ── Delete confirm ────────────────────────────────────────────
  const [delTarget, setDelTarget] = useState<{ type: "procedure" | "category"; id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();
  const [delLoading, setDelLoading] = useState(false);

  // ── Reload helpers ────────────────────────────────────────────
  const reloadProcedures = useCallback(async () => {
    const data = await apiFetch("/procedures?includeInactive=true");
    setProcedures(data);
  }, []);

  const reloadCategories = useCallback(async () => {
    const data = await apiFetch("/procedures/categories");
    setCategories(data);
  }, []);

  // ── Procedure CRUD ────────────────────────────────────────────
  async function saveProc(data: Record<string, unknown>) {
    if (editProc) {
      await apiFetch(`/procedures/${editProc.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    } else {
      await apiFetch("/procedures", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    setPanel("none");
    startTransition(() => { reloadProcedures(); });
  }

  async function deleteProc(id: string) {
    setDelLoading(true);
    try {
      await apiFetch(`/procedures/${id}`, { method: "DELETE" });
      setDelTarget(null);
      startTransition(() => { reloadProcedures(); });
    } finally {
      setDelLoading(false);
    }
  }

  // ── Category CRUD ─────────────────────────────────────────────
  async function saveCat(data: Record<string, unknown>) {
    if (editCat) {
      await apiFetch(`/procedures/categories/${editCat.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    } else {
      await apiFetch("/procedures/categories", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    setPanel("none");
    startTransition(() => { reloadCategories(); reloadProcedures(); });
  }

  async function deleteCat(id: string) {
    setDelLoading(true);
    try {
      await apiFetch(`/procedures/categories/${id}`, { method: "DELETE" });
      setDelTarget(null);
      startTransition(() => { reloadCategories(); reloadProcedures(); });
    } finally {
      setDelLoading(false);
    }
  }

  // ── Filtered lists ────────────────────────────────────────────
  const filteredProcs = procedures.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
    const matchCat = !filterCat || p.categoryId === filterCat;
    return matchSearch && matchCat;
  });

  // ── Panel title ───────────────────────────────────────────────
  const panelTitle = {
    "add-procedure": "Thêm thủ tục mới",
    "edit-procedure": `Sửa: ${editProc?.name ?? ""}`,
    "add-category": "Thêm danh mục mới",
    "edit-category": `Sửa danh mục: ${editCat?.name ?? ""}`,
    none: "",
  }[panel];

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
          {(["procedures", "categories"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "procedures" ? "Thủ tục" : "Danh mục"}
            </button>
          ))}
        </div>

        {/* Search (procedures only) */}
        {tab === "procedures" && (
          <input
            className="h-9 w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Tìm theo tên, mã…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {/* Category filter */}
        {tab === "procedures" && (
          <select
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex gap-2">
          {tab === "categories" && (
            <button
              onClick={() => { setEditCat(null); setPanel("add-category"); }}
              className="flex items-center gap-1.5 rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              + Thêm danh mục
            </button>
          )}
          {tab === "procedures" && (
            <button
              onClick={() => { setEditProc(null); setPanel("add-procedure"); }}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              + Thêm thủ tục
            </button>
          )}
        </div>
      </div>

      {/* ── Procedures Table ─────────────────────────────────────────── */}
      {tab === "procedures" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Mã", "Tên thủ tục", "Danh mục", "SLA", "Lệ phí", "Trạng thái", "Hồ sơ", ""].map((h) => (
                  <th key={h} className="p-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProcs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    {search || filterCat ? "Không tìm thấy kết quả phù hợp" : "Chưa có thủ tục nào"}
                  </td>
                </tr>
              ) : (
                filteredProcs.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="p-4">
                      <span className="font-mono text-xs text-slate-500">{p.code}</span>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {p.processingAgency && (
                        <p className="mt-0.5 text-xs text-slate-400">{p.processingAgency}</p>
                      )}
                    </td>
                    <td className="p-4">
                      {p.category ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {p.category.icon && <span>{p.category.icon}</span>}
                          {p.category.name}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-4 text-slate-600">{p.slaWorkDays} ngày</td>
                    <td className="p-4 text-slate-600">
                      {p.fee ? `${Number(p.fee).toLocaleString("vi-VN")}đ` : (
                        <span className="text-green-600 font-medium">Miễn phí</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-block w-fit rounded-full px-2 py-0.5 text-xs font-bold ${
                            p.isOnline
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {p.isOnline ? "✓ Trực tuyến" : "Trực tiếp"}
                        </span>
                        {!p.isActive && (
                          <span className="inline-block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            Tạm dừng
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-slate-500">
                      {p._count?.applications ?? 0} hồ sơ
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditProc(p); setPanel("edit-procedure"); }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => setDelTarget({ type: "procedure", id: p.id, name: p.name })}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            {filteredProcs.length} / {procedures.length} thủ tục
          </div>
        </div>
      )}

      {/* ── Categories Table ─────────────────────────────────────────── */}
      {tab === "categories" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Mã", "Danh mục", "Màu sắc", "Thứ tự", "Số thủ tục", "Trạng thái", ""].map((h) => (
                  <th key={h} className="p-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                    Chưa có danh mục nào
                  </td>
                </tr>
              ) : (
                [...categories]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="p-4">
                        <span className="font-mono text-xs text-slate-500">{c.code}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {c.icon && <span className="text-base">{c.icon}</span>}
                          <span className="font-semibold text-slate-900">{c.name}</span>
                        </div>
                        {c.nameEn && <p className="mt-0.5 text-xs text-slate-400">{c.nameEn}</p>}
                      </td>
                      <td className="p-4">
                        {c.colorHex ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="h-5 w-5 rounded-full border border-slate-200"
                              style={{ background: c.colorHex }}
                            />
                            <span className="font-mono text-xs text-slate-500">{c.colorHex}</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="p-4 text-slate-600">{c.sortOrder}</td>
                      <td className="p-4 text-slate-500">
                        {procedures.filter((p) => p.categoryId === c.id).length} thủ tục
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            c.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {c.isActive ? "Hoạt động" : "Tạm dừng"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditCat(c); setPanel("edit-category"); }}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => setDelTarget({ type: "category", id: c.id, name: c.name })}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
                          >
                            Xoá
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            {categories.length} danh mục
          </div>
        </div>
      )}

      {/* ── Slide Panel ──────────────────────────────────────────────── */}
      <SlidePanel open={panel !== "none"} onClose={() => setPanel("none")} title={panelTitle}>
        {(panel === "add-procedure" || panel === "edit-procedure") && (
          <ProcedureForm
            initial={editProc ?? undefined}
            categories={categories}
            onSave={saveProc}
            onCancel={() => setPanel("none")}
          />
        )}
        {(panel === "add-category" || panel === "edit-category") && (
          <CategoryForm
            initial={editCat ?? undefined}
            onSave={saveCat}
            onCancel={() => setPanel("none")}
          />
        )}
      </SlidePanel>

      {/* ── Delete Confirm ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!delTarget}
        message={
          delTarget
            ? `Bạn có chắc muốn xoá "${delTarget.name}"? Hành động này không thể hoàn tác.`
            : ""
        }
        loading={delLoading}
        onConfirm={() => {
          if (!delTarget) return;
          if (delTarget.type === "procedure") deleteProc(delTarget.id);
          else deleteCat(delTarget.id);
        }}
        onCancel={() => setDelTarget(null)}
      />
    </>
  );
}
