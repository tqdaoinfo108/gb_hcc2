import { getCitizens } from "../lib/data";
import { EmptyState, PageHeader, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function CitizensPage() {
  const citizens = await getCitizens();

  return (
    <div>
      <PageHeader title="Công dân" description="Hồ sơ công dân đã xác thực và tương tác với hệ thống kiosk." />

      {citizens.length === 0 ? (
        <EmptyState title="Chưa có công dân" detail="Công dân xuất hiện sau lần xác thực đầu tiên tại kiosk." />
      ) : (
        <Table headers={["Họ tên", "CCCD", "SĐT", "Địa chỉ", "VNeID", "Hồ sơ", "Giấy tờ", "Lần xác thực cuối"]}>
          {citizens.map(c => (
            <tr key={c.id} className="border-t border-slate-100">
              <Td bold>{c.fullName}</Td>
              <Td><span className="font-mono text-sm">{c.nationalId}</span></Td>
              <Td>{c.phone ?? "—"}</Td>
              <Td>
                <span className="text-xs text-slate-500">
                  {[c.ward, c.district, c.province].filter(Boolean).join(", ") || "—"}
                </span>
              </Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.vneidLinked ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.vneidLinked ? "✓ Liên kết" : "Chưa liên kết"}
                </span>
              </Td>
              <Td>{c._count.applications}</Td>
              <Td>{c._count.documents}</Td>
              <Td>{fmt(c.lastVerifiedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
