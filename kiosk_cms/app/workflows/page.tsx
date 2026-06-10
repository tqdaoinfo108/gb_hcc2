import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function IntegrationSystemsPage() {
  const systems = await prisma.externalSystem.findMany({
    where: { deletedAt: null },
    include: {
      connections: { where: { deletedAt: null } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Hệ thống bên ngoài" description="Danh sách tích hợp — Cổng DVC Quốc gia, hệ thống bộ ngành." />

      {systems.length === 0 ? (
        <EmptyState title="Chưa có hệ thống tích hợp" detail="Tạo qua POST /api/external-systems." />
      ) : (
        <Table headers={["Tên", "Mã", "Base URL", "Auth", "Timeout", "Kết nối", "Trạng thái"]}>
          {systems.map(s => (
            <tr key={s.id} className="border-t border-slate-100">
              <Td bold>{s.name}</Td>
              <Td><span className="font-mono text-xs">{s.code}</span></Td>
              <Td><span className="text-xs text-slate-500 truncate max-w-xs block">{s.baseUrl}</span></Td>
              <Td>{s.authType ?? "—"}</Td>
              <Td>{s.timeoutMs}ms</Td>
              <Td>{s.connections.length}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {s.isActive ? "Active" : "Inactive"}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
