import { getProcedures } from "../lib/data";
import { EmptyState, PageHeader, Table, Td } from "../components";

export const dynamic = "force-dynamic";

export default async function ProceduresPage() {
  const procedures = await getProcedures();

  return (
    <div>
      <PageHeader title="Thủ tục hành chính" description="Danh mục thủ tục, yêu cầu hồ sơ, SLA xử lý." />

      {procedures.length === 0 ? (
        <EmptyState title="Chưa có thủ tục" detail="Tạo thủ tục qua API /procedures." />
      ) : (
        <Table headers={["Mã", "Tên thủ tục", "Danh mục", "SLA (ngày)", "Lệ phí", "Yêu cầu", "Hồ sơ", "Online"]}>
          {procedures.map(p => (
            <tr key={p.id} className="border-t border-slate-100">
              <Td><span className="font-mono text-xs">{p.code}</span></Td>
              <Td bold>{p.name}</Td>
              <Td>{p.category?.name ?? "—"}</Td>
              <Td>{p.slaWorkDays} ngày</Td>
              <Td>{p.fee ? `${Number(p.fee).toLocaleString("vi-VN")}đ` : "Miễn phí"}</Td>
              <Td>{p._count.requirements}</Td>
              <Td>{p._count.applications}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.isOnline ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {p.isOnline ? "✓ Online" : "Trực tiếp"}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
