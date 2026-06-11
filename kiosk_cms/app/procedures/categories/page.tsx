import { getProcedureCategories } from "../../lib/data";
import { PageHeader } from "../../components";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function ProcedureCategoriesPage() {
  const categories = await getProcedureCategories();
  return (
    <div>
      <PageHeader
        title="Danh mục thủ tục"
        description="Cấu hình nhóm danh mục hiển thị trên kiosk. Mỗi danh mục có màu sắc, icon và thứ tự riêng."
      />
      <CategoriesClient initialCategories={categories as any} />
    </div>
  );
}
