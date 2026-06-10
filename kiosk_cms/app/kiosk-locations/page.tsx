import { PageHeader } from "../components";
import { getKioskLocations } from "../lib/data";
import { KioskLocationsClient } from "./KioskLocationsClient";

export const dynamic = "force-dynamic";

export default async function KioskLocationsPage() {
  const locations = await getKioskLocations();
  return (
    <div>
      <PageHeader
        title="Địa điểm Kiosk"
        description="Quản lý danh mục địa điểm để lựa chọn khi cấu hình từng thiết bị kiosk."
      />
      <KioskLocationsClient initialLocations={locations} />
    </div>
  );
}
