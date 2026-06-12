import { getDevices } from "../lib/data";
import { getScope } from "../lib/session";
import { EmptyState, PageHeader, StatusBadge, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const { scopeLocationIds } = await getScope();
  const devices = await getDevices(scopeLocationIds);

  return (
    <div>
      <PageHeader
        title="Thiết bị Kiosk"
        description="Quản lý Device ID cố định, địa điểm, khu vực đặt máy, trạng thái bảo trì và thông tin hệ thống."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Tổng thiết bị", value: devices.length, color: "#0068B7" },
          { label: "Đang hoạt động", value: devices.filter((d) => d.effectiveStatus === "ONLINE").length, color: "#16A34A" },
          { label: "Offline", value: devices.filter((d) => d.effectiveStatus === "OFFLINE").length, color: "#64748B" },
          { label: "Bảo trì", value: devices.filter((d) => d.effectiveStatus === "MAINTENANCE").length, color: "#D97706" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-black" style={{ color: metric.color }}>{metric.value}</p>
          </div>
        ))}
      </div>

      {devices.length === 0 ? (
        <EmptyState title="Chưa có thiết bị" detail="Thiết bị sẽ tự đăng ký bằng Device ID cố định trong lần heartbeat đầu tiên." />
      ) : (
        <Table headers={["Device ID", "Tên máy", "Địa điểm", "Khu vực", "IP", "Trạng thái", "Phiên", "Heartbeat cuối"]}>
          {devices.map((device) => (
            <tr key={device.id} className="border-t border-slate-100">
              <Td bold>
                <a href={`/devices/${device.id}`} className="font-mono text-blue-600 hover:underline">
                  {device.deviceId}
                </a>
              </Td>
              <Td>{device.name ?? device.serialNumber}</Td>
              <Td>
                <span className="block font-semibold">{device.location.name}</span>
                <span className="text-xs text-slate-400">{device.location.district} · {device.location.province}</span>
              </Td>
              <Td>{device.placement ?? "Chưa cấu hình"}</Td>
              <Td>{device.ipAddress ?? "—"}</Td>
              <Td><StatusBadge status={device.effectiveStatus.toLowerCase()} /></Td>
              <Td>{device._count.sessions}</Td>
              <Td>{fmt(device.lastHeartbeat)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
