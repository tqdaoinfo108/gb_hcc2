import { getHomeServices } from "../lib/data";
import { getScope } from "../lib/session";
import { PageHeader } from "../components";
import { HomeServicesClient } from "./HomeServicesClient";

export const dynamic = "force-dynamic";

export default async function HomeServicesPage() {
  const { selectedLocationId, availableLocations, isSuperAdmin } = await getScope();

  // Effective location to configure: explicit selection, else the only assigned
  // location (location admin with one), else global default set.
  const effectiveLoc =
    selectedLocationId ??
    (!isSuperAdmin && availableLocations.length === 1 ? availableLocations[0].id : null);

  const services = await getHomeServices(effectiveLoc);
  const locName = effectiveLoc
    ? (availableLocations.find((l) => l.id === effectiveLoc)?.name ?? "Địa điểm")
    : null;

  return (
    <div>
      <PageHeader
        title="Màn hình Home"
        description="Cấu hình các thẻ dịch vụ hiển thị trên màn hình chính của kiosk, theo từng địa điểm."
      />
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm">
        <span>🛠️</span>
        <span className="text-slate-700">
          Đang cấu hình:{" "}
          <b className="text-[#0068B7]">{locName ?? "Mặc định chung (mọi địa điểm)"}</b>
          {!locName && " — chọn một địa điểm ở thanh trên để cấu hình riêng cho địa điểm đó."}
        </span>
      </div>
      <HomeServicesClient
        initialServices={services as any}
        locationId={effectiveLoc}
      />
    </div>
  );
}
