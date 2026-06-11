import { getProcedures, getProcedureCategories } from "../lib/data";
import { PageHeader } from "../components";
import { ProceduresClient } from "./ProceduresClient";

export const dynamic = "force-dynamic";

export default async function ProceduresPage() {
  const [procedures, categories] = await Promise.all([
    getProcedures(),
    getProcedureCategories(),
  ]);

  // Prisma Decimal → number so it serialises cleanly to the Client Component
  const serialised = procedures.map((p) => ({
    ...p,
    fee: p.fee != null ? Number(p.fee) : null,
  }));

  return (
    <div>
      <PageHeader
        title="Thủ tục hành chính"
        description="Quản lý danh mục thủ tục, yêu cầu hồ sơ, SLA xử lý và nộp trực tuyến."
      />
      <ProceduresClient
        initialProcedures={serialised as any}
        initialCategories={categories as any}
      />
    </div>
  );
}
