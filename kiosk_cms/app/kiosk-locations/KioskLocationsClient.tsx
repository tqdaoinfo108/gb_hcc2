"use client";
import { useState } from "react";

interface Location {
  id: string;
  code: string;
  name: string;
  address: string;
  district: string | null;
  province: string | null;
  isActive: boolean;
  _count: { devices: number };
}

type LocationForm = {
  id?: string;
  code: string;
  name: string;
  address: string;
  district: string;
  province: string;
};

const EMPTY_FORM: LocationForm = {
  code: "",
  name: "",
  address: "",
  district: "",
  province: "",
};

export function KioskLocationsClient({ initialLocations }: { initialLocations: Location[] }) {
  const [locations, setLocations] = useState(initialLocations);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/kiosk-locations", { cache: "no-store" });
    if (!response.ok) throw new Error(await getError(response));
    setLocations(await response.json());
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim() || !form.address.trim()) {
      setMessage("Vui lòng nhập mã, tên và địa chỉ.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        form.id ? `/api/kiosk-locations/${encodeURIComponent(form.id)}` : "/api/kiosk-locations",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            address: form.address,
            district: form.district || undefined,
            province: form.province || undefined,
          }),
        },
      );
      if (!response.ok) throw new Error(await getError(response));
      await refresh();
      setForm(EMPTY_FORM);
      setMessage(form.id ? "Đã cập nhật địa điểm." : "Đã tạo địa điểm mới.");
    } catch (error) {
      setMessage(`Không thể lưu: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(location: Location) {
    setMessage(null);
    try {
      const response = await fetch(`/api/kiosk-locations/${encodeURIComponent(location.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !location.isActive }),
      });
      if (!response.ok) throw new Error(await getError(response));
      await refresh();
      setMessage(location.isActive ? "Đã ngừng sử dụng địa điểm." : "Đã kích hoạt địa điểm.");
    } catch (error) {
      setMessage(`Không thể cập nhật: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function edit(location: Location) {
    setForm({
      id: location.id,
      code: location.code,
      name: location.name,
      address: location.address,
      district: location.district ?? "",
      province: location.province ?? "",
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">{form.id ? "Chỉnh sửa địa điểm" : "Tạo địa điểm"}</h2>
        <p className="mt-1 text-sm text-slate-500">Địa điểm đang hoạt động sẽ xuất hiện trong cấu hình kiosk.</p>

        <div className="mt-5 grid gap-4">
          <Field label="Mã địa điểm *">
            <input className="cms-input uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CUA_NAM_HOAN_KIEM" />
          </Field>
          <Field label="Tên địa điểm *">
            <input className="cms-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="UBND Phường Cửa Nam" />
          </Field>
          <Field label="Địa chỉ *">
            <input className="cms-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Số nhà, đường, phường/xã" />
          </Field>
          <Field label="Quận/Huyện">
            <input className="cms-input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="Quận Hoàn Kiếm" />
          </Field>
          <Field label="Tỉnh/Thành phố">
            <input className="cms-input" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Hà Nội" />
          </Field>
        </div>

        {message && <p className={`mt-4 text-sm font-semibold ${message.startsWith("Đã") ? "text-green-600" : "text-red-600"}`}>{message}</p>}
        <div className="mt-5 flex gap-2">
          {form.id && (
            <button type="button" onClick={() => setForm(EMPTY_FORM)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600">
              Hủy
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Đang lưu..." : form.id ? "Lưu thay đổi" : "Tạo địa điểm"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">Danh sách địa điểm</h2>
          <p className="mt-1 text-sm text-slate-500">{locations.filter((item) => item.isActive).length} địa điểm đang hoạt động</p>
        </div>
        <div className="divide-y divide-slate-100">
          {locations.map((location) => (
            <article key={location.id} className={`p-5 ${location.isActive ? "" : "bg-slate-50 opacity-65"}`}>
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900">{location.name}</h3>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-500">{location.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${location.isActive ? "bg-green-50 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                      {location.isActive ? "Hoạt động" : "Ngừng sử dụng"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{location.address}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {[location.district, location.province].filter(Boolean).join(" · ") || "Chưa cấu hình khu vực"} · {location._count.devices} thiết bị
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => edit(location)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Sửa</button>
                  <button type="button" onClick={() => toggle(location)} className={`rounded-lg px-3 py-2 text-xs font-bold ${location.isActive ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                    {location.isActive ? "Ngừng" : "Kích hoạt"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-700">{label}{children}</label>;
}

async function getError(response: Response) {
  const payload = await response.json().catch(() => null);
  const message = payload?.message ?? payload?.detail ?? `HTTP ${response.status}`;
  return Array.isArray(message) ? message.join(", ") : String(message);
}
