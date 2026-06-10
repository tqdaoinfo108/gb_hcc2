import { getHomeServices } from "../lib/data";
import { PageHeader } from "../components";
import { HomeServicesClient } from "./HomeServicesClient";

export const dynamic = "force-dynamic";

export default async function HomeServicesPage() {
  const services = await getHomeServices();
  return (
    <div>
      <PageHeader
        title="Màn hình Home"
        description="Cấu hình danh sách dịch vụ hiển thị trên màn hình chính của kiosk. Ẩn/hiện, đổi tên, thay đổi thứ tự hiển thị."
      />
      <HomeServicesClient initialServices={services as any} />
    </div>
  );
}
