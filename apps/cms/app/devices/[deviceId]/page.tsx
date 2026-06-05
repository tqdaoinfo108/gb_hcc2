import { prisma } from "../../lib/prisma";
import { EmptyState, PageHeader, StatusBadge } from "../../components";

export const dynamic = "force-dynamic";

export default async function DeviceDetailPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  const device = await prisma.device.findUnique({
    where: { deviceId },
    include: {
      statuses: { take: 20, orderBy: { lastHeartbeat: "desc" } },
      commands: { take: 20, orderBy: { issuedAt: "desc" } },
      deployments: { take: 20, include: { otaPackage: true } }
    }
  });

  if (!device) {
    return <EmptyState title="Device not found" detail="No PostgreSQL row matches this device ID." />;
  }

  const latest = device.statuses[0];

  return (
    <div>
      <PageHeader title={device.deviceId} description="Device detail, remote command history, and deployment history." />
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Status</p>
          <div className="mt-3"><StatusBadge status={latest?.online ? "online" : "offline"} /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Locked</p>
          <p className="mt-3 text-2xl font-black">{device.isLocked ? "Yes" : "No"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Version</p>
          <p className="mt-3 text-2xl font-black">{device.version}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Location</p>
          <p className="mt-3 text-2xl font-black">{device.location}</p>
        </div>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Command history</h2>
          {device.commands.length === 0 ? (
            <EmptyState title="No commands" detail="Remote control commands will be stored here." />
          ) : (
            <div className="grid gap-3">
              {device.commands.map((command) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={command.id}>
                  <p className="font-semibold">{command.command}</p>
                  <p className="text-sm text-slate-500">{command.status} at {command.issuedAt.toISOString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Health samples</h2>
          {device.statuses.length === 0 ? (
            <EmptyState title="No health samples" detail="The device has not sent a heartbeat yet." />
          ) : (
            <div className="grid gap-3">
              {device.statuses.map((status) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={status.id}>
                  <p className="font-semibold">{status.lastHeartbeat.toISOString()}</p>
                  <p className="text-sm text-slate-500">
                    CPU {status.cpuPercent ?? "No data"} | RAM {status.ramPercent ?? "No data"} | Disk {status.diskPercent ?? "No data"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
