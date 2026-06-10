import { getDashboardData } from "./lib/data";
import { EmptyState, Metric, PageHeader, StatusBadge, Table, Td, fmt } from "./components";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { summary, recentApps, recentSessions } = await getDashboardData();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Tổng quan toàn hệ thống — thiết bị, hồ sơ, hàng đợi, phản hồi công dân."
      />

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Tổng thiết bị"        value={summary.totalDevices}   />
        <Metric label="Đang online"           value={summary.onlineDevices}  color="#16A34A" />
        <Metric label="Phiên đang hoạt động"  value={summary.activeSessions} color="#0068B7" />
        <Metric label="Điểm hài lòng TB"      value={`${summary.avgSatisfaction} / 5`} color="#D97706" />
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-4">
        <Metric label="Tổng hồ sơ"     value={summary.totalApps}    />
        <Metric label="Đã nộp"          value={summary.submittedApps} color="#1D4ED8" />
        <Metric label="Hoàn thành"      value={summary.completedApps} color="#16A34A" />
        <Metric label="Vé hàng đợi"     value={summary.totalTickets}  />
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-2">
        {/* Recent applications */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Hồ sơ gần đây</h2>
          {recentApps.length === 0 ? (
            <EmptyState title="Chưa có hồ sơ" />
          ) : (
            <div className="grid gap-2">
              {recentApps.map(app => (
                <div key={app.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="font-semibold text-sm">{app.trackingCode}</p>
                    <p className="text-xs text-slate-500">{app.citizen?.fullName} · {app.procedure?.name}</p>
                  </div>
                  <StatusBadge status={app.status.toLowerCase()} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent sessions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Phiên làm việc gần đây</h2>
          {recentSessions.length === 0 ? (
            <EmptyState title="Chưa có phiên" />
          ) : (
            <div className="grid gap-2">
              {recentSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="font-semibold text-sm">{s.device?.location?.name ?? s.device?.serialNumber}</p>
                    <p className="text-xs text-slate-500">{fmt(s.startTime)} · {s.language.toUpperCase()}</p>
                  </div>
                  <StatusBadge status={s.status.toLowerCase()} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
