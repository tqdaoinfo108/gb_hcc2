"use client";

import { useState, useTransition, useCallback } from "react";
import { auditHeaders } from "../../lib/audit-headers";

/* ── Types ─────────────────────────────────────────────────────── */
export interface Category {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  colorHex: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  _count: { procedures: number };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...auditHeaders(), ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg);
  }
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
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>
  );
}

/* ── Confirm Dialog ────────────────────────────────────────────── */
function ConfirmDialog({
  open,
  message,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
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
            {loading ? "Đang xoá…" : "Xác nhận xoá"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Form field ────────────────────────────────────────────────── */
function F({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const ic =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";

/* ── Category Form ─────────────────────────────────────────────── */
interface FormState {
  code: string;
  name: string;
  nameEn: string;
  icon: string;
  colorHex: string;
  sortOrder: number | string;
  isActive: boolean;
  parentId: string;
}

function CategoryForm({
  initial,
  categories,
  onSave,
  onCancel,
}: {
  initial?: Partial<Category>;
  categories: Category[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    nameEn: initial?.nameEn ?? "",
    icon: initial?.icon ?? "",
    colorHex: initial?.colorHex ?? "#3B82F6",
    sortOrder: initial?.sortOrder ?? 0,
    isActive: initial?.isActive ?? true,
    parentId: initial?.parentId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await onSave({
        ...form,
        sortOrder: Number(form.sortOrder),
        parentId: form.parentId || undefined,
        nameEn: form.nameEn || undefined,
        icon: form.icon || undefined,
        colorHex: form.colorHex || undefined,
      });
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setSaving(false);
    }
  }

  /* Parent options: exclude self and own children to prevent cycles */
  const parentOptions = categories.filter((c) => c.id !== initial?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Code + Sort order */}
      <div className="grid grid-cols-2 gap-4">
        <F label="Mã danh mục" required>
          <input
            className={ic}
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            required
            placeholder="VD: HOTICH"
          />
        </F>
        <F label="Thứ tự hiển thị">
          <input
            className={ic}
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
        </F>
      </div>

      <F label="Tên danh mục (Tiếng Việt)" required>
        <input
          className={ic}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
          placeholder="VD: Hộ tịch"
        />
      </F>

      <F label="Tên tiếng Anh">
        <input
          className={ic}
          value={form.nameEn}
          onChange={(e) => set("nameEn", e.target.value)}
          placeholder="VD: Civil Status"
        />
      </F>

      {/* Icon + Color */}
      <div className="grid grid-cols-2 gap-4">
        <F label="Icon (emoji / text)">
          <input
            className={ic}
            value={form.icon}
            onChange={(e) => set("icon", e.target.value)}
            placeholder="VD: 📋"
          />
        </F>
        <F label="Màu nhận dạng">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.colorHex}
              onChange={(e) => set("colorHex", e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 p-0.5"
            />
            <input
              className={`${ic} flex-1`}
              value={form.colorHex}
              onChange={(e) => set("colorHex", e.target.value)}
              placeholder="#3B82F6"
            />
          </div>
        </F>
      </div>

      {/* Preview chip */}
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Xem trước</p>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: form.colorHex || "#3B82F6" }}
        >
          {form.icon && <span>{form.icon}</span>}
          {form.name || "Tên danh mục"}
        </span>
      </div>

      {/* Parent category */}
      <F label="Danh mục cha (tuỳ chọn)">
        <select
          className={ic}
          value={form.parentId}
          onChange={(e) => set("parentId", e.target.value)}
        >
          <option value="">— Danh mục gốc —</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ""}{c.name}
            </option>
          ))}
        </select>
      </F>

      {/* Active toggle */}
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50">
        <div
          className={`relative h-5 w-9 rounded-full transition-colors ${form.isActive ? "bg-blue-600" : "bg-slate-300"}`}
          onClick={() => set("isActive", !form.isActive)}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isActive ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </div>
        <span className="text-sm font-medium text-slate-700">
          {form.isActive ? "Đang hoạt động" : "Tạm dừng"}
        </span>
      </label>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {err}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : initial?.id ? "Cập nhật danh mục" : "Tạo danh mục"}
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

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main component                                                    */
/* ═══════════════════════════════════════════════════════════════════ */
export function CategoriesClient({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [, startTransition] = useTransition();

  // Panel state
  type Mode = "none" | "add" | "edit";
  const [mode, setMode] = useState<Mode>("none");
  const [editing, setEditing] = useState<Category | null>(null);

  // Delete confirm
  const [delTarget, setDelTarget] = useState<Category | null>(null);
  const [delLoading, setDelLoading] = useState(false);

  // Search
  const [search, setSearch] = useState("");

  // Toast
  const [toast, setToast] = useState("");
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const reload = useCallback(async () => {
    const data = await apiFetch("/procedures/categories?includeInactive=true");
    if (data) setCategories(data);
  }, []);

  async function handleSave(data: Record<string, unknown>) {
    if (editing) {
      await apiFetch(`/procedures/categories/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      showToast(`Đã cập nhật "${editing.name}"`);
    } else {
      await apiFetch("/procedures/categories", {
        method: "POST",
        body: JSON.stringify(data),
      });
      showToast("Đã tạo danh mục mới");
    }
    setMode("none");
    startTransition(() => { reload(); });
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDelLoading(true);
    try {
      await apiFetch(`/procedures/categories/${delTarget.id}`, { method: "DELETE" });
      showToast(`Đã xoá "${delTarget.name}"`);
      setDelTarget(null);
      startTransition(() => { reload(); });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Lỗi xoá");
    } finally {
      setDelLoading(false);
    }
  }

  const filtered = categories.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()),
  );

  const panelTitle = mode === "edit" ? `Sửa: ${editing?.name}` : "Thêm danh mục mới";

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed right-6 top-6 z-[70] rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="Tìm theo tên, mã…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto">
          <button
            onClick={() => { setEditing(null); setMode("add"); }}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
          >
            + Thêm danh mục
          </button>
        </div>
      </div>

      {/* Grid cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
          <p className="text-lg font-bold text-slate-400">
            {search ? "Không tìm thấy kết quả" : "Chưa có danh mục nào"}
          </p>
          {!search && (
            <button
              onClick={() => { setEditing(null); setMode("add"); }}
              className="mt-4 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              Tạo danh mục đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...filtered]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi"))
            .map((cat) => (
              <div
                key={cat.id}
                className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
                  cat.isActive ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"
                }`}
              >
                {/* Color bar */}
                <div
                  className="h-1.5 w-full"
                  style={{ background: cat.colorHex ?? "#94a3b8" }}
                />

                <div className="p-4">
                  {/* Icon + code row */}
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {cat.icon ? (
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                          style={{ background: (cat.colorHex ?? "#3B82F6") + "22" }}
                        >
                          {cat.icon}
                        </span>
                      ) : (
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
                          style={{ background: cat.colorHex ?? "#94a3b8" }}
                        >
                          {cat.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">{cat.code}</span>
                  </div>

                  {/* Name */}
                  <p className="font-bold text-slate-900 leading-tight">{cat.name}</p>
                  {cat.nameEn && (
                    <p className="mt-0.5 text-xs text-slate-400">{cat.nameEn}</p>
                  )}

                  {/* Stats row */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="text-slate-400">📄</span>
                        {cat._count.procedures} thủ tục
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-slate-400">#</span>
                        {cat.sortOrder}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        cat.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-600"
                      }`}
                    >
                      {cat.isActive ? "Hoạt động" : "Tạm dừng"}
                    </span>
                  </div>

                  {/* Parent indicator */}
                  {cat.parent && (
                    <p className="mt-2 text-xs text-slate-400">
                      ↳ {cat.parent.name}
                    </p>
                  )}

                  {/* Action row — visible on hover */}
                  <div className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => { setEditing(cat); setMode("edit"); }}
                      className="flex-1 rounded-lg bg-blue-50 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => setDelTarget(cat)}
                      className="flex-1 rounded-lg bg-red-50 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
                      title={cat._count.procedures > 0 ? `${cat._count.procedures} thủ tục sẽ mồ côi` : "Xoá"}
                    >
                      Xoá{cat._count.procedures > 0 ? ` (${cat._count.procedures})` : ""}
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Summary bar */}
      <p className="mt-4 text-xs text-slate-400">
        {filtered.length} / {categories.length} danh mục
        {" · "}{categories.filter((c) => c.isActive).length} đang hoạt động
        {" · "}{categories.reduce((s, c) => s + c._count.procedures, 0)} thủ tục tổng cộng
      </p>

      {/* Slide panel */}
      <SlidePanel open={mode !== "none"} onClose={() => setMode("none")} title={panelTitle}>
        <CategoryForm
          initial={editing ?? undefined}
          categories={categories}
          onSave={handleSave}
          onCancel={() => setMode("none")}
        />
      </SlidePanel>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!delTarget}
        loading={delLoading}
        message={
          delTarget
            ? delTarget._count.procedures > 0
              ? `Danh mục "${delTarget.name}" có ${delTarget._count.procedures} thủ tục đang liên kết. Sau khi xoá, các thủ tục đó sẽ mất danh mục. Xác nhận?`
              : `Xoá danh mục "${delTarget.name}"? Hành động này không thể hoàn tác.`
            : ""
        }
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
      />
    </>
  );
}
