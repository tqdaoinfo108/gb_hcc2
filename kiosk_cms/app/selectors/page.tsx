import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader, Metric, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [notifications, templates] = await Promise.all([
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { template: true } }),
    prisma.notificationTemplate.findMany({ where: { deletedAt: null } }),
  ]);

  const sent   = notifications.filter(n => n.status === "SENT").length;
  const failed = notifications.filter(n => n.status === "FAILED").length;

  return (
    <div>
      <PageHeader title="Thông báo" description="SMS, email, màn hình kiosk, biên nhận QR — lịch sử gửi và trạng thái." />

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Metric label="Tổng"      value={notifications.length} />
        <Metric label="Đã gửi"    value={sent}   color="#16A34A" />
        <Metric label="Thất bại"  value={failed} color="#DC2626" />
      </section>

      {notifications.length === 0 ? (
        <EmptyState title="Chưa có thông báo" />
      ) : (
        <Table headers={["Kênh", "Người nhận", "Tiêu đề", "Template", "Trạng thái", "Gửi lúc", "Thử lại"]}>
          {notifications.map(n => (
            <tr key={n.id} className="border-t border-slate-100">
              <Td>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{n.channel}</span>
              </Td>
              <Td>{n.recipient}</Td>
              <Td>{n.subject ?? "—"}</Td>
              <Td>{n.template?.code ?? "—"}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  n.status === "SENT" ? "bg-green-100 text-green-700"
                  : n.status === "FAILED" ? "bg-red-100 text-red-700"
                  : "bg-yellow-50 text-yellow-700"
                }`}>{n.status}</span>
              </Td>
              <Td>{fmt(n.sentAt)}</Td>
              <Td>{n.retryCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
