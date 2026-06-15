import { getRemoteDevices } from "../lib/data";
import { getScope } from "../lib/session";
import { PageHeader } from "../components";
import { RemoteDebugClient } from "./RemoteDebugClient";

export const dynamic = "force-dynamic";

export default async function RemoteDebugPage() {
  const { scopeLocationIds, isSuperAdmin } = await getScope();
  const devices = await getRemoteDevices(scopeLocationIds);

  return (
    <div>
      <PageHeader
        title="Điều khiển từ xa"
        description="Giám sát tình trạng thiết bị theo thời gian thực và gửi lệnh quản trị tới từng kiosk."
      />
      <RemoteDebugClient initialDevices={devices as never} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
