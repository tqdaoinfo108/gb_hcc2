import { getQueueOverview } from "../lib/data";
import { getScope } from "../lib/session";
import { PageHeader } from "../components";
import { QueueClient } from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { selectedLocationId, availableLocations, isSuperAdmin } = await getScope();
  const effectiveLoc =
    selectedLocationId ?? (!isSuperAdmin && availableLocations.length === 1 ? availableLocations[0].id : null);
  const locName = effectiveLoc ? (availableLocations.find((l) => l.id === effectiveLoc)?.name ?? "Địa điểm") : null;
  const { services, stats } = await getQueueOverview(effectiveLoc);

  return (
    <div>
      <PageHeader
        title="Hàng đợi"
        description="Quản lý hệ thống bốc số — dịch vụ, quầy, vé thời gian thực, theo từng địa điểm."
      />
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
        <span>🎟️</span>
        Đang cấu hình hàng đợi cho:{" "}
        <b className="text-[#0068B7]">{locName ?? "Mặc định chung (mọi địa điểm)"}</b>
        {!locName && " — chọn địa điểm ở thanh trên để cấu hình riêng."}
      </div>
      <QueueClient initialServices={services as any} initialStats={stats} locationId={effectiveLoc} />
    </div>
  );
}
