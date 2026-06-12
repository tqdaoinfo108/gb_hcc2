"use client";

import { useState, useTransition, useCallback } from "react";
import { auditHeaders } from "../lib/audit-headers";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

interface Role { id: string; code: string; name: string }
interface Loc { id: string; code: string; name: string }
interface Mod { key: string; label: string; group: string }
interface User {
  id: string; username: string; email: string; fullName: string;
  phone?: string | null; isActive: boolean; isSuperAdmin: boolean; lastLoginAt?: string | null;
  userRoles: { role: { code: string; name: string } }[];
  userLocations: { location: { id: string; name: string } }[];
  moduleAccess?: { module: string }[];
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...auditHeaders(), ...(init?.headers ?? {}) } });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const ic =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#0068B7] focus:bg-white focus:ring-2 focus:ring-[#0068B7]/15";

/* ── Slide panel ─────────────────────────────────────────── */
function Panel({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} />
      <div className={`fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  );
}

/* ── User form ───────────────────────────────────────────── */
function UserForm({ initial, roles, locations, modules, onSave, onCancel }: {
  initial?: User | null; roles: Role[]; locations: Loc[]; modules: Mod[];
  onSave: (data: Record<string, unknown>) => Promise<void>; onCancel: () => void;
}) {
  const defaultModules = modules.map((m) => m.key).filter((k) => k !== "users" && k !== "audit");
  const editing = !!initial;
  const [f, setF] = useState({
    username: initial?.username ?? "",
    email: initial?.email ?? "",
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    password: "",
    isSuperAdmin: initial?.isSuperAdmin ?? false,
    isActive: initial?.isActive ?? true,
    roleCodes: initial?.userRoles.map((r) => r.role.code) ?? ["LOCATION_ADMIN"],
    locationIds: initial?.userLocations.map((l) => l.location.id) ?? [],
    modules: initial ? (initial.moduleAccess ?? []).map((m) => m.module) : defaultModules,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const toggleArr = (k: "roleCodes" | "locationIds" | "modules", v: string) =>
    setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: f.fullName, phone: f.phone || undefined,
        isSuperAdmin: f.isSuperAdmin, isActive: f.isActive,
        roleCodes: f.roleCodes, locationIds: f.isSuperAdmin ? [] : f.locationIds,
        modules: f.isSuperAdmin ? [] : f.modules,
      };
      if (!editing) { payload.username = f.username; payload.email = f.email; payload.password = f.password; }
      else if (f.password) payload.password = f.password;
      await onSave(payload);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message.replace(/^\{.*"message":"?|"?.*\}$/g, "") : String(ex));
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!editing && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tên đăng nhập"><input className={ic} value={f.username} onChange={(e) => set("username", e.target.value)} required placeholder="cuabac" /></Field>
          <Field label="Email"><input type="email" className={ic} value={f.email} onChange={(e) => set("email", e.target.value)} required placeholder="cuabac@hcc.vn" /></Field>
        </div>
      )}
      <Field label="Họ và tên"><input className={ic} value={f.fullName} onChange={(e) => set("fullName", e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Điện thoại"><input className={ic} value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label={editing ? "Đổi mật khẩu (bỏ trống = giữ)" : "Mật khẩu"}>
          <input type="text" className={ic} value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="≥ 6 ký tự" required={!editing} />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
        <input type="checkbox" checked={f.isSuperAdmin} onChange={(e) => set("isSuperAdmin", e.target.checked)} className="h-4 w-4 accent-[#0068B7]" />
        <div>
          <span className="text-sm font-semibold text-slate-800">Quản trị hệ thống (Super Admin)</span>
          <span className="block text-xs text-slate-500">Toàn quyền trên mọi địa điểm</span>
        </div>
      </label>

      <Field label="Vai trò">
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button type="button" key={r.id} onClick={() => toggleArr("roleCodes", r.code)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${f.roleCodes.includes(r.code) ? "border-[#0068B7] bg-[#0068B7]/10 text-[#0068B7]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {r.name}
            </button>
          ))}
        </div>
      </Field>

      {!f.isSuperAdmin && (
        <Field label="Địa điểm quản lý">
          <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {locations.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">Chưa có địa điểm.</p>}
            {locations.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={f.locationIds.includes(l.id)} onChange={() => toggleArr("locationIds", l.id)} className="h-4 w-4 accent-[#0068B7]" />
                <span className="text-sm text-slate-700">{l.name}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-400">{l.code}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Người dùng chỉ thấy dữ liệu (kiosk, đánh giá, sao y) của các địa điểm này.</p>
        </Field>
      )}

      {!f.isSuperAdmin && (
        <Field label="Quyền truy cập module (ẩn/hiện menu)">
          <div className="grid max-h-52 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {modules.map((m) => (
              <label key={m.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={f.modules.includes(m.key)} onChange={() => toggleArr("modules", m.key)} className="h-4 w-4 accent-[#0068B7]" />
                <span className="text-sm text-slate-700">{m.label}</span>
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">{m.group}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Chỉ các module được tích mới hiện trong menu của người dùng này.</p>
        </Field>
      )}

      {editing && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-[#0068B7]" />
          <span className="font-medium text-slate-700">Đang hoạt động</span>
        </label>
      )}

      {err && <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600">{err}</p>}

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#0068B7" }}>
          {saving ? "Đang lưu…" : editing ? "Cập nhật" : "Tạo người dùng"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Huỷ</button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export function UsersClient({ initialUsers, roles, locations, modules }: { initialUsers: User[]; roles: Role[]; locations: Loc[]; modules: Mod[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [mode, setMode] = useState<"none" | "add" | "edit">("none");
  const [editing, setEditing] = useState<User | null>(null);
  const [del, setDel] = useState<User | null>(null);
  const [, start] = useTransition();
  const [toast, setToast] = useState("");

  const reload = useCallback(async () => {
    const data = await api("/admin/users");
    if (data) setUsers(data);
  }, []);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function save(data: Record<string, unknown>) {
    if (editing) { await api(`/admin/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(data) }); flash("Đã cập nhật người dùng"); }
    else { await api("/admin/users", { method: "POST", body: JSON.stringify(data) }); flash("Đã tạo người dùng"); }
    setMode("none"); start(() => { reload(); });
  }
  async function doDelete() {
    if (!del) return;
    await api(`/admin/users/${del.id}`, { method: "DELETE" });
    flash("Đã xoá người dùng"); setDel(null); start(() => { reload(); });
  }

  return (
    <>
      {toast && <div className="fixed right-6 top-6 z-[70] rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>}

      <div className="mb-5 flex justify-end">
        <button onClick={() => { setEditing(null); setMode("add"); }} className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: "#0068B7" }}>+ Thêm người dùng</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Họ tên", "Đăng nhập", "Vai trò", "Địa điểm", "Trạng thái", ""].map((h) => <th key={h} className="p-4 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} className="py-14 text-center text-sm text-slate-400">Chưa có người dùng</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="p-4">
                  <p className="font-semibold text-slate-900">{u.fullName}{u.isSuperAdmin ? " 👑" : ""}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </td>
                <td className="p-4"><span className="font-mono text-xs text-slate-500">{u.username}</span></td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {u.userRoles.length ? u.userRoles.map((r, i) => (
                      <span key={i} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0068B7]">{r.role.name}</span>
                    )) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                </td>
                <td className="p-4">
                  {u.isSuperAdmin
                    ? <span className="text-xs font-semibold text-slate-500">🌐 Toàn hệ thống</span>
                    : <span className="text-xs text-slate-600">{u.userLocations.length ? u.userLocations.map((l) => l.location.name).join(", ") : <span className="text-slate-400">Chưa gán</span>}</span>}
                </td>
                <td className="p-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{u.isActive ? "Hoạt động" : "Khoá"}</span>
                </td>
                <td className="p-4">
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(u); setMode("edit"); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#0068B7] hover:bg-blue-50">Sửa</button>
                    <button onClick={() => setDel(u)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50">Xoá</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Panel open={mode !== "none"} onClose={() => setMode("none")} title={mode === "edit" ? `Sửa: ${editing?.fullName}` : "Thêm người dùng"}>
        {mode !== "none" && (
          <UserForm initial={editing} roles={roles} locations={locations} modules={modules} onSave={save} onCancel={() => setMode("none")} />
        )}
      </Panel>

      {del && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-sm text-slate-700">Xoá người dùng <b>{del.fullName}</b>? Tài khoản sẽ bị khoá và không đăng nhập được.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setDel(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Huỷ</button>
              <button onClick={doDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Xoá</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
