import { PageHeader, EmptyState } from "../components";
import { getScope } from "../lib/session";

export const dynamic = "force-dynamic";

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

interface AuditRow {
  id: string;
  createdAt: string;
  actorName?: string | null;
  action: string;
  module: string;
  method?: string | null;
  path?: string | null;
  targetId?: string | null;
  statusCode?: number | null;
  ipAddress?: string | null;
  locationId?: string | null;
}

const ACTION_STYLE: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
}

export default async function AuditPage() {
  const { selectedLocationId, availableLocations, isSuperAdmin } = await getScope();
  const qs = new URLSearchParams({ limit: "250" });
  if (selectedLocationId) qs.set("locationId", selectedLocationId);

  let rows: AuditRow[] = [];
  try {
    const r = await fetch(`${API}/admin/audit-logs?${qs}`, { cache: "no-store" });
    if (r.ok) rows = await r.json();
  } catch { /* show empty */ }

  const locName = (id?: string | null) =>
    id ? (availableLocations.find((l) => l.id === id)?.name ?? id.slice(0, 8)) : "—";

  return (
    <div>
      <PageHeader
        title="Nhật ký hệ thống"
        description="Lịch sử mọi thao tác thêm / sửa / xoá trên hệ thống, theo địa điểm."
      />
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
        <span>📜</span>
        Đang xem nhật ký:{" "}
        <b className="text-[#0068B7]">
          {selectedLocationId ? locName(selectedLocationId) : isSuperAdmin ? "Tất cả địa điểm" : "Các địa điểm của tôi"}
        </b>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Chưa có nhật ký" detail="Các thao tác CRUD sẽ được ghi lại tại đây." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Thời gian", "Người thực hiện", "Thao tác", "Module", "Đường dẫn", "Địa điểm", "IP"].map((h) => (
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
                  <td className="p-3">
                    <span className="font-mono text-[11px] text-slate-500">{a.method} {a.path}</span>
                    {a.targetId && <span className="ml-1 text-[10px] text-slate-400">#{a.targetId.slice(0, 8)}</span>}
                  </td>
                  <td className="p-3 text-xs text-slate-500">{locName(a.locationId)}</td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-3 py-2.5 text-xs text-slate-400">{rows.length} bản ghi gần nhất</div>
        </div>
      )}
    </div>
  );
}
