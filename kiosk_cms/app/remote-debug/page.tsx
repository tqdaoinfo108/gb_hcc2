import { prisma } from "../lib/prisma";
import { getScope } from "../lib/session";
import { EmptyState, PageHeader, Table, Td, StatusBadge, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const { scopeLocationIds } = await getScope();
  const sessions = await prisma.kioskSession.findMany({
    where: {
      deletedAt: null,
      ...(scopeLocationIds === null ? {} : { device: { locationId: { in: scopeLocationIds } } }),
    },
    orderBy: { startTime: "desc" },
    take: 40,
    include: {
      device: { include: { location: true } },
      _count: { select: { events: true, applications: true } },
    },
  });

  return (
    <div>
      <PageHeader title="Phiên làm việc" description="Theo dõi toàn bộ phiên tương tác tại kiosk — trạng thái, màn hình, bảo mật." />

      {sessions.length === 0 ? (
        <EmptyState title="Chưa có phiên" detail="Phiên xuất hiện khi công dân bắt đầu tương tác tại kiosk." />
      ) : (
        <Table headers={["Thiết bị", "Vị trí", "Bắt đầu", "Kết thúc", "Màn hình cuối", "Trạng thái", "Sự kiện", "Hồ sơ", "Đã dọn"]}>
          {sessions.map(s => (
            <tr key={s.id} className="border-t border-slate-100">
              <Td><span className="font-mono text-xs">{s.device?.serialNumber ?? s.deviceId.slice(0, 8)}</span></Td>
              <Td>{s.device?.location?.name ?? "—"}</Td>
              <Td>{fmt(s.startTime)}</Td>
              <Td>{fmt(s.endTime)}</Td>
              <Td><span className="text-xs text-slate-500">{s.currentScreen ?? "—"}</span></Td>
              <Td><StatusBadge status={s.status.toLowerCase()} /></Td>
              <Td>{s._count.events}</Td>
              <Td>{s._count.applications}</Td>
              <Td>
                <span className={`text-xs font-bold ${s.securityCleaned ? "text-green-600" : "text-slate-400"}`}>
                  {s.securityCleaned ? "✓" : "—"}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
