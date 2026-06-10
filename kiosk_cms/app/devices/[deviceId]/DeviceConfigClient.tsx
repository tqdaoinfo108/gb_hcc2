"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Location {
  id: string;
  code: string;
  name: string;
  address: string;
  district: string | null;
  province: string | null;
}

interface DeviceConfig {
  id: string;
  deviceId: string;
  name: string | null;
  placement: string | null;
  locationId: string;
  isEnabled: boolean;
  maintenanceMessage: string | null;
  tickerText: string | null;
  model: string | null;
  firmwareVersion: string | null;
}

export function DeviceConfigClient({
  initialDevice,
  locations,
}: {
  initialDevice: DeviceConfig;
  locations: Location[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialDevice);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update<K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetchWithNetworkRetry(`/api/kiosk-devices/${encodeURIComponent(form.id)}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          locationId: form.locationId,
          name: form.name,
          placement: form.placement,
          isEnabled: form.isEnabled,
          maintenanceMessage: form.maintenanceMessage,
          tickerText: form.tickerText,
          model: form.model,
          firmwareVersion: form.firmwareVersion,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = result?.message ?? result?.detail ?? `HTTP ${response.status}`;
        throw new Error(Array.isArray(detail) ? detail.join(", ") : detail);
      }
      setForm((current) => ({
        ...current,
        name: result.name,
        placement: result.placement,
        locationId: result.locationId,
        isEnabled: result.isEnabled,
        maintenanceMessage: result.maintenanceMessage,
        tickerText: result.tickerText,
        model: result.model,
        firmwareVersion: result.firmwareVersion,
      }));
      setMessage(result.realtimeDelivered
        ? "Đã lưu và áp dụng tức thời trên kiosk."
        : "Đã lưu cấu hình. Kiosk sẽ đồng bộ lại qua heartbeat.");
      router.refresh();
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Không thể lưu cấu hình: ${detail === "Failed to fetch" ? "Mất kết nối tới CMS. Vui lòng tải lại trang." : detail}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Cấu hình vận hành</h2>
          <p className="mt-1 text-sm text-slate-500">
            Device ID cố định: <span className="font-mono font-semibold text-slate-700">{form.deviceId}</span>
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(event) => update("isEnabled", event.target.checked)}
            className="h-5 w-5 accent-blue-600"
          />
          <span>
            <span className="block text-sm font-bold text-slate-800">
              {form.isEnabled ? "Cho phép sử dụng" : "Đang bảo trì"}
            </span>
            <span className="block text-xs text-slate-500">Áp dụng ngay trên kiosk</span>
          </span>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tên hiển thị">
          <input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} className="cms-input" />
        </Field>
        <Field label="Địa điểm">
          <select value={form.locationId} onChange={(e) => update("locationId", e.target.value)} className="cms-input">
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} · {location.district} · {location.province}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Khu vực đặt máy">
          <input
            value={form.placement ?? ""}
            onChange={(e) => update("placement", e.target.value)}
            placeholder="Ví dụ: Sảnh tầng 1, cạnh quầy tiếp nhận"
            className="cms-input"
          />
        </Field>
        <Field label="Model thiết bị">
          <input value={form.model ?? ""} onChange={(e) => update("model", e.target.value)} className="cms-input" />
        </Field>
        <Field label="Phiên bản phần mềm">
          <input
            value={form.firmwareVersion ?? ""}
            onChange={(e) => update("firmwareVersion", e.target.value)}
            className="cms-input"
          />
        </Field>
        <Field label="Thông báo khi bảo trì">
          <input
            value={form.maintenanceMessage ?? ""}
            onChange={(e) => update("maintenanceMessage", e.target.value)}
            placeholder="Thiết bị đang được bảo trì. Vui lòng quay lại sau."
            className="cms-input"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Dòng chữ chạy phía dưới màn hình">
            <textarea
              value={form.tickerText ?? ""}
              onChange={(e) => update("tickerText", e.target.value)}
              placeholder="Nhập giờ làm việc, hotline và thông báo phục vụ..."
              rows={3}
              maxLength={2000}
              className="cms-input resize-y"
            />
          </Field>
          <p className="mt-2 text-xs text-slate-400">
            Nội dung được áp dụng tức thời trên kiosk qua WebSocket.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className={`text-sm font-semibold ${message?.startsWith("Đã") ? "text-green-600" : "text-red-600"}`}>
          {message}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </button>
      </div>
    </section>
  );
}

async function fetchWithNetworkRetry(url: string, init: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(url, {
        ...init,
        credentials: "same-origin",
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}
