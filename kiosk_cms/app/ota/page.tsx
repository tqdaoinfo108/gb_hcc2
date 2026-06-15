import { getScope } from "../lib/session";
import { PageHeader } from "../components";
import { OtaClient } from "./OtaClient";

export const dynamic = "force-dynamic";

export default async function OtaPage() {
  const { selectedLocationId, isSuperAdmin, scopeLocationIds } = await getScope();
  // Matrix scope: explicit selection, else the single location of a location-admin.
  const matrixLocationId =
    selectedLocationId ?? (!isSuperAdmin && scopeLocationIds && scopeLocationIds.length === 1 ? scopeLocationIds[0] : null);

  return (
    <div>
      <PageHeader
        title="Cập nhật OTA"
        description="Phát hành phiên bản ứng dụng kiosk, triển khai theo tỉ lệ (canary), theo nhóm thiết bị và theo dõi tiến độ cài đặt."
      />
      <OtaClient matrixLocationId={matrixLocationId} />
    </div>
  );
}
