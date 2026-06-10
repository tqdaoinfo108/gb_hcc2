/* ── Shared UI components for CMS ─────────────────────────── */

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-7">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "rgb(0,104,183)" }}>
        Hệ thống Dịch vụ công thông minh
      </p>
      <h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>
      {description && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
    </header>
  );
}

export function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black" style={{ color: color ?? "rgb(15,23,42)" }}>{value}</p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
      <p className="text-lg font-bold text-slate-400">{title}</p>
      {detail && <p className="mt-2 text-sm text-slate-400">{detail}</p>}
    </div>
  );
}

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  online:      { label: "Online",      bg: "#DCFCE7", color: "#16A34A" },
  offline:     { label: "Offline",     bg: "#F1F5F9", color: "#64748B" },
  active:      { label: "Đang hoạt động", bg: "#DBEAFE", color: "#1D4ED8" },
  completed:   { label: "Hoàn thành",  bg: "#DCFCE7", color: "#16A34A" },
  submitted:   { label: "Đã nộp",      bg: "#DBEAFE", color: "#1D4ED8" },
  processing:  { label: "Đang xử lý",  bg: "#FEF3C7", color: "#D97706" },
  rejected:    { label: "Từ chối",     bg: "#FEE2E2", color: "#DC2626" },
  draft:       { label: "Nháp",        bg: "#F1F5F9", color: "#64748B" },
  waiting:     { label: "Chờ",         bg: "#FEF3C7", color: "#D97706" },
  error:       { label: "Lỗi",         bg: "#FEE2E2", color: "#DC2626" },
  maintenance: { label: "Bảo trì",     bg: "#FEF3C7", color: "#D97706" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status.toLowerCase()] ?? { label: status, bg: "#F1F5F9", color: "#64748B" };
  return (
    <span className="rounded-full px-3 py-1 text-xs font-bold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {headers.map(h => <th key={h} className="p-4 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td className={`p-4 ${bold ? "font-semibold" : ""}`}>{children}</td>;
}

export function fmt(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}
