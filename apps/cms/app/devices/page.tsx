import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader, StatusBadge } from "../components";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const devices = await prisma.device.findMany({
    orderBy: { updatedAt: "desc" },
    include: { statuses: { take: 1, orderBy: { lastHeartbeat: "desc" } } }
  });

  return (
    <div>
      <PageHeader
        title="Device Fleet"
        description="Device identity, version, live health, lock state, and last heartbeat stored in PostgreSQL."
      />
      {devices.length === 0 ? (
        <EmptyState title="No devices" detail="Kiosks will appear after the first authenticated heartbeat." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">Device ID</th>
                <th className="p-4">Location</th>
                <th className="p-4">Version</th>
                <th className="p-4">Online</th>
                <th className="p-4">CPU</th>
                <th className="p-4">RAM</th>
                <th className="p-4">Disk</th>
                <th className="p-4">Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const status = device.statuses[0];
                return (
                  <tr className="border-t border-slate-200" key={device.id}>
                    <td className="p-4 font-semibold">
                      <a href={`/devices/${device.deviceId}`}>{device.deviceId}</a>
                    </td>
                    <td className="p-4">{device.location}</td>
                    <td className="p-4">{device.version}</td>
                    <td className="p-4"><StatusBadge status={status?.online ? "online" : "offline"} /></td>
                    <td className="p-4">{status?.cpuPercent ?? "No data"}</td>
                    <td className="p-4">{status?.ramPercent ?? "No data"}</td>
                    <td className="p-4">{status?.diskPercent ?? "No data"}</td>
                    <td className="p-4">{status?.lastHeartbeat?.toISOString() ?? "No heartbeat"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
