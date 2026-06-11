import { getWorkflowBuilderData } from "../lib/data";
import { PageHeader } from "../components";
import { WorkflowsClient } from "./WorkflowsClient";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const { templates, procedures, runners } = await getWorkflowBuilderData();

  return (
    <div>
      <PageHeader
        title="Quy trình tự động (Selenium)"
        description="Cấu hình các bước tự động hoá nộp hồ sơ trên Cổng Dịch vụ công. Mỗi quy trình gắn với một thủ tục và được runner thực thi bằng trình duyệt thật."
      />
      <WorkflowsClient
        initialTemplates={templates}
        procedures={procedures}
        runners={runners}
      />
    </div>
  );
}
