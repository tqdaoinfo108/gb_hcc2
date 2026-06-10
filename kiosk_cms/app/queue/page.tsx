import { getQueueOverview } from "../lib/data";
import { PageHeader } from "../components";
import { QueueClient } from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { services, stats } = await getQueueOverview();

  return (
    <div>
      <PageHeader
        title="Hàng đợi"
        description="Quản lý hệ thống bốc số — dịch vụ, quầy, vé thời gian thực."
      />
      <QueueClient initialServices={services as any} initialStats={stats} />
    </div>
  );
}
