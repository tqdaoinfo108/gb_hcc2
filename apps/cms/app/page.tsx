import { getDashboardData } from "./lib/data";
import { EmptyState, Metric, PageHeader, StatusBadge } from "./components";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Realtime fleet summary, public service workflow health, and OTA deployment state from PostgreSQL."
      />
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Total kiosk" value={data.summary.total} />
        <Metric label="Online" value={data.summary.online} />
        <Metric label="Offline" value={data.summary.offline} />
        <Metric label="Error sessions" value={data.summary.error} />
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Map view by registered location</h2>
          {data.devices.length === 0 ? (
            <EmptyState title="No kiosk locations" detail="PostgreSQL has no devices yet." />
          ) : (
            <div className="grid gap-3">
              {data.devices.map((device) => {
                const status = data.statuses.find((item) => item.deviceId === device.id);
                return (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4" key={device.id}>
                    <div>
                      <p className="font-semibold text-slate-950">{device.location}</p>
                      <p className="text-sm text-slate-500">{device.deviceId}</p>
                    </div>
                    <StatusBadge status={status?.online ? "online" : "offline"} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Latest OTA deployments</h2>
          {data.deployments.length === 0 ? (
            <EmptyState title="No OTA deployments" detail="Deployment rows will appear after packages are assigned." />
          ) : (
            <div className="grid gap-3">
              {data.deployments.map((deployment) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={deployment.id}>
                  <p className="font-semibold text-slate-950">{deployment.device.deviceId}</p>
                  <p className="text-sm text-slate-500">
                    {deployment.otaPackage.component} {deployment.otaPackage.version}
                  </p>
                  <p className="mt-2 text-xs font-bold text-[rgb(154,75,45)]">{deployment.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
