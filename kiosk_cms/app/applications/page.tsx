import { getApplications } from "../lib/data";
import { EmptyState, PageHeader, StatusBadge, Table, Td, fmt } from "../components";
import { ApplicationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const apps = await getApplications(status as ApplicationStatus | undefined);

  const statusTabs: { label: string; value: string }[] = [
    { label: "Tất cả",       value: "" },
    { label: "Nháp",         value: "DRAFT" },
    { label: "Đã nộp",       value: "SUBMITTED" },
    { label: "Đang xử lý",   value: "PROCESSING" },
    { label: "Hoàn thành",   value: "COMPLETED" },
    { label: "Từ chối",      value: "REJECTED" },
  ];

  return (
    <div>
      <PageHeader title="Quản lý hồ sơ" description="Toàn bộ hồ sơ hành chính công dân, trạng thái xử lý, lịch sử thay đổi." />

      {/* Status filter tabs */}
      <div className="mb-5 flex gap-2 flex-wrap">
        {statusTabs.map(tab => (
          <a key={tab.value}
            href={tab.value ? `/applications?status=${tab.value}` : "/applications"}
            className="rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors"
            style={{
              background: status === tab.value || (!status && !tab.value) ? "#0068B7" : "#fff",
              color:      status === tab.value || (!status && !tab.value) ? "#fff" : "#475569",
              borderColor: status === tab.value || (!status && !tab.value) ? "#0068B7" : "#CBD5E1",
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {apps.length === 0 ? (
        <EmptyState title="Không có hồ sơ" detail="Chưa có hồ sơ nào phù hợp với bộ lọc." />
      ) : (
        <Table headers={["Mã biên nhận", "Công dân", "Thủ tục", "Ngành", "Trạng thái", "Ngày tạo", "Dự kiến trả"]}>
          {apps.map(app => (
            <tr key={app.id} className="border-t border-slate-100">
              <Td bold>
                <span className="font-mono text-blue-700">{app.trackingCode}</span>
              </Td>
              <Td>{app.citizen?.fullName ?? "—"}</Td>
              <Td>{app.procedure?.name ?? "—"}</Td>
              <Td>{app.procedure?.category?.name ?? "—"}</Td>
              <Td><StatusBadge status={app.status.toLowerCase()} /></Td>
              <Td>{fmt(app.createdAt)}</Td>
              <Td>{fmt(app.expectedResultAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
