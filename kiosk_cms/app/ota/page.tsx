import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const [systems, logs] = await Promise.all([
    prisma.externalSystem.findMany({ where: { deletedAt: null }, include: { connections: true } }),
    prisma.integrationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { connection: { include: { system: true } } } }),
  ]);

  return (
    <div>
      <PageHeader title="Tích hợp hệ thống" description="Kết nối với Cổng DVC Quốc gia và các hệ thống bên ngoài." />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {systems.map(s => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">{s.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {s.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{s.baseUrl}</p>
            <p className="mt-2 text-xs text-slate-400">{s.connections.length} endpoint(s)</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-bold">Integration logs gần đây</h2>
      {logs.length === 0 ? (
        <EmptyState title="Chưa có log" detail="Log sẽ xuất hiện sau khi tích hợp được gọi." />
      ) : (
        <Table headers={["Hệ thống", "Endpoint", "Status", "Thời gian", "Duration", "Thử lại"]}>
          {logs.map(l => (
            <tr key={l.id} className="border-t border-slate-100">
              <Td>{l.connection.system.name}</Td>
              <Td><span className="font-mono text-xs">{l.connection.endpoint}</span></Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {l.statusCode ?? (l.success ? "OK" : "ERR")}
                </span>
              </Td>
              <Td>{fmt(l.createdAt)}</Td>
              <Td>{l.durationMs ? `${l.durationMs}ms` : "—"}</Td>
              <Td>{l.retryCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
