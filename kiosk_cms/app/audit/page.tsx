import { PageHeader, EmptyState } from "../components";
import { getScope } from "../lib/session";

export const dynamic = "force-dynamic";

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

interface AuditRow {
  id: string;
  adminId?: string | null;
  createdAt: string;
  actorName?: string | null;
  action: string;
  module: string;
  method?: string | null;
  path?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  statusCode?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  locationId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

interface AuditResponse {
  data: AuditRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_STYLE: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

const ACTIONS = ["CREATE", "UPDATE", "DELETE"];
const MODULES = [
  ["users", "Người dùng"],
  ["locations", "Địa điểm"],
  ["home_services", "Màn hình Home"],
  ["devices", "Thiết bị"],
  ["ota", "OTA / Tích hợp"],
  ["remote_debug", "Điều khiển từ xa"],
  ["queue", "Hàng đợi"],
  ["applications", "Hồ sơ"],
  ["procedures", "Thủ tục"],
  ["workflows", "Quy trình"],
  ["citizens", "Công dân"],
  ["copydoc", "Sao y tài liệu"],
  ["feedback", "Đánh giá"],
  ["ai", "Trợ lý AI"],
  ["selectors", "Bộ chọn"],
  ["audit", "Nhật ký hệ thống"],
] as const;

function fmt(d: string) {
  return new Date(d).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
}

function toPositiveInt(value: string | undefined, fallback: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.trunc(n), max);
}

function formatJson(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return JSON.stringify(value, null, 2);
}

function statusClass(code?: number | null) {
  if (!code) return "bg-slate-100 text-slate-500";
  if (code >= 200 && code < 300) return "bg-emerald-100 text-emerald-700";
  if (code >= 400) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; module?: string; action?: string }>;
}) {
  const params = await searchParams;
  const { selectedLocationId, availableLocations, isSuperAdmin } = await getScope();
  const page = toPositiveInt(params.page, 1, 10_000);
  const limit = toPositiveInt(params.limit, 50, 100);
  const module = params.module?.trim() || "";
  const action = params.action?.trim() || "";

  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (selectedLocationId) qs.set("locationId", selectedLocationId);
  if (module) qs.set("module", module);
  if (action) qs.set("action", action);

  let audit: AuditResponse = { data: [], total: 0, page, limit, totalPages: 1 };
  try {
    const r = await fetch(`${API}/admin/audit-logs?${qs}`, { cache: "no-store" });
    if (r.ok) {
      const body = await r.json();
      audit = Array.isArray(body)
        ? { data: body, total: body.length, page: 1, limit: body.length || limit, totalPages: 1 }
        : body;
    }
  } catch { /* show empty */ }

  const locName = (id?: string | null) =>
    id ? (availableLocations.find((l) => l.id === id)?.name ?? id.slice(0, 8)) : "—";

  const hrefFor = (overrides: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    if (module) next.set("module", module);
    if (action) next.set("action", action);
    next.set("page", String(audit.page));
    next.set("limit", String(audit.limit));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    const s = next.toString();
    return s ? `/audit?${s}` : "/audit";
  };

  const rows = audit.data;
  const firstRow = audit.total === 0 ? 0 : (audit.page - 1) * audit.limit + 1;
  const lastRow = Math.min(audit.page * audit.limit, audit.total);

  return (
    <div>
      <PageHeader
        title="Nhật ký hệ thống"
        description="Lịch sử thao tác thêm / sửa / xoá trên hệ thống, có phân trang để giảm tải truy vấn."
      />

      <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
        <span>Đang xem nhật ký: </span>
        <b className="text-[#0068B7]">{selectedLocationId ? locName(selectedLocationId) : isSuperAdmin ? "Tất cả địa điểm" : "Các địa điểm của tôi"}</b>
        <span className="ml-2 text-slate-500">({audit.total.toLocaleString("vi-VN")} bản ghi)</span>
      </div>

      <form action="/audit" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="page" value="1" />
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Module
          <select name="module" defaultValue={module} className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="">Tất cả module</option>
            {MODULES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Thao tác
          <select name="action" defaultValue={action} className="min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="">Tất cả thao tác</option>
            {ACTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Mỗi trang
          <select name="limit" defaultValue={String(limit)} className="min-w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            {[25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-[#0068B7] px-4 py-2 text-sm font-bold text-white hover:bg-[#005999]">Lọc</button>
        {(module || action || limit !== 50) && (
          <a href="/audit" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Xoá lọc</a>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Chưa có nhật ký" detail="Các thao tác CRUD sẽ được ghi lại tại đây." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Thời gian", "Người thực hiện", "Thao tác", "Module", "Đường dẫn", "Trạng thái", "Địa điểm", "IP"].map((h) => (
                  <th key={h} className="p-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="p-3 whitespace-nowrap text-xs text-slate-500">{fmt(a.createdAt)}</td>
                  <td className="p-3">{a.actorName || <span className="text-slate-400">Hệ thống</span>}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTION_STYLE[a.action] ?? "bg-slate-100 text-slate-600"}`}>
                      {a.action}
                    </span>
                  </td>
                  <td className="p-3"><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">{a.module}</span></td>
                  <td className="max-w-xl p-3">
                    <div className="font-mono text-[11px] text-slate-500">{a.method} {a.path}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-400">
                      {a.targetType && <span>target: {a.targetType}</span>}
                      {a.targetId && <span>#{a.targetId}</span>}
                      {a.adminId && <span>admin: {a.adminId.slice(0, 8)}</span>}
                    </div>
                    {(a.userAgent || a.before || a.after) && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer font-semibold text-blue-700">Chi tiết</summary>
                        <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 text-slate-600">
                          {a.userAgent && <div><b>User agent:</b> <span className="break-all font-mono text-[11px]">{a.userAgent}</span></div>}
                          {a.before && <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px]">{formatJson(a.before)}</pre>}
                          {a.after && <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px]">{formatJson(a.after)}</pre>}
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(a.statusCode)}`}>{a.statusCode ?? "—"}</span></td>
                  <td className="p-3 text-xs text-slate-500">{locName(a.locationId)}</td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500">
            <span>
              Đang xem {firstRow.toLocaleString("vi-VN")}-{lastRow.toLocaleString("vi-VN")} / {audit.total.toLocaleString("vi-VN")} bản ghi,
              trang {audit.page.toLocaleString("vi-VN")} / {audit.totalPages.toLocaleString("vi-VN")}
            </span>
            <div className="flex gap-2">
              {audit.page > 1 ? (
                <a className="rounded border border-slate-200 px-3 py-1 font-semibold hover:bg-slate-50" href={hrefFor({ page: audit.page - 1 })}>Trước</a>
              ) : (
                <span className="rounded border border-slate-100 px-3 py-1 text-slate-300">Trước</span>
              )}
              {audit.page < audit.totalPages ? (
                <a className="rounded border border-slate-200 px-3 py-1 font-semibold hover:bg-slate-50" href={hrefFor({ page: audit.page + 1 })}>Sau</a>
              ) : (
                <span className="rounded border border-slate-100 px-3 py-1 text-slate-300">Sau</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
