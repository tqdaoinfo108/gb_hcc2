import { getDeviceById, getKioskLocations } from "../../lib/data";
import { EmptyState, PageHeader, StatusBadge, Metric, fmt } from "../../components";
import { DeviceConfigClient } from "./DeviceConfigClient";

export const dynamic = "force-dynamic";

export default async function DeviceDetailPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  const [device, locations] = await Promise.all([getDeviceById(deviceId), getKioskLocations()]);

  if (!device) {
    return <EmptyState title="Không tìm thấy thiết bị" detail="Kiểm tra lại Device ID hoặc UUID nội bộ." />;
  }

  const latest = device.healthLogs[0];
  const locationLabel = [device.location.name, device.location.district, device.location.province].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <a href="/devices" className="text-sm font-semibold text-blue-600 hover:underline">← Danh sách thiết bị</a>
      <PageHeader
        title={device.name ?? device.deviceId}
        description={`${locationLabel} · ${device.placement ?? "Chưa cấu hình khu vực đặt máy"}`}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Trạng thái" value={device.effectiveStatus} color={device.effectiveStatus === "ONLINE" ? "#16A34A" : device.effectiveStatus === "MAINTENANCE" ? "#D97706" : "#64748B"} />
        <Metric label="CPU" value={latest?.cpuUsage != null ? `${latest.cpuUsage.toFixed(0)}%` : "—"} />
        <Metric label="RAM" value={latest?.memoryUsage != null ? `${latest.memoryUsage.toFixed(0)}%` : "—"} />
        <Metric label="Heartbeat" value={fmt(device.lastHeartbeat)} />
      </section>

      <DeviceConfigClient
        initialDevice={{
          id: device.id,
          deviceId: device.deviceId,
          name: device.name,
          placement: device.placement,
          locationId: device.locationId,
          isEnabled: device.isEnabled,
          maintenanceMessage: device.maintenanceMessage,
          tickerText: device.tickerText,
          model: device.model,
          firmwareVersion: device.firmwareVersion,
        }}
        locations={locations.filter((location) => location.isActive || location.id === device.locationId)}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Thông tin máy">
          <Info label="Device ID" value={device.deviceId} mono />
          <Info label="Serial" value={device.serialNumber} mono />
          <Info label="IP gần nhất" value={device.ipAddress ?? "—"} />
          <Info label="Hostname" value={latest?.hostname ?? "—"} />
          <Info label="Hệ điều hành" value={latest?.os ?? "—"} />
          <Info label="Trình duyệt" value={latest?.browser ?? "—"} />
          <Info label="Độ phân giải" value={latest?.screenResolution ?? "—"} />
          <Info label="Phiên bản ứng dụng" value={latest?.appVersion ?? device.firmwareVersion ?? "—"} />
        </Panel>

        <Panel title="Linh kiện">
          {device.components.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu linh kiện" />
          ) : device.components.map((component) => (
            <div key={component.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
              <div>
                <p className="text-sm font-semibold">{component.name}</p>
                <p className="text-xs text-slate-500">{component.type}</p>
              </div>
              <StatusBadge status={component.status.toLowerCase()} />
            </div>
          ))}
        </Panel>

        <Panel title="Phiên làm việc gần đây">
          {device.sessions.length === 0 ? (
            <EmptyState title="Chưa có phiên làm việc" />
          ) : device.sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
              <div>
                <p className="text-sm font-semibold">{fmt(session.startTime)}</p>
                <p className="text-xs text-slate-500">{session.id} · {session.currentScreen ?? "idle"}</p>
              </div>
              <StatusBadge status={session.status.toLowerCase()} />
            </div>
          ))}
        </Panel>

        <Panel title="Telemetry gần đây">
          {device.healthLogs.length === 0 ? (
            <EmptyState title="Chưa có heartbeat" />
          ) : device.healthLogs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-100 p-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="font-semibold">{fmt(log.createdAt)}</span>
                <StatusBadge status={log.status.toLowerCase()} />
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                IP {log.ipAddress ?? "—"} · CPU {log.cpuUsage?.toFixed(0) ?? "—"}% · RAM {log.memoryUsage?.toFixed(0) ?? "—"}%
                · Disk {log.diskUsage?.toFixed(0) ?? "—"}% · {log.currentScreen ?? "idle"}
              </p>
            </div>
          ))}
        </Panel>

        <Panel title="Lịch sử vận hành">
          {device.actions.length === 0 ? (
            <EmptyState title="Chưa có thay đổi cấu hình" />
          ) : device.actions.map((action) => (
            <div key={action.id} className="rounded-xl border border-slate-100 p-3 text-sm">
              <p className="font-semibold">{action.action}</p>
              <p className="text-xs text-slate-500">{fmt(action.performedAt)}{action.result ? ` · ${action.result}` : ""}</p>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-semibold text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
