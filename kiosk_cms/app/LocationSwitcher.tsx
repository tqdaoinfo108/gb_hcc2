"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface Loc { id: string; code: string; name: string }

export function LocationSwitcher({
  locations,
  selectedId,
  isSuperAdmin,
}: {
  locations: Loc[];
  selectedId: string | null;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function pick(value: string) {
    // Persist selection (server reads this cookie via getScope).
    document.cookie = `hcc_loc=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setOpen(false);
    router.refresh();
  }

  const current = selectedId ? locations.find(l => l.id === selectedId) : null;
  const label = current ? current.name : (isSuperAdmin ? "Tất cả địa điểm" : "Các địa điểm của tôi");

  // Nothing to switch between → just show a static chip.
  const canSwitch = isSuperAdmin || locations.length > 1;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => canSwitch && setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition ${canSwitch ? "hover:border-[#0068B7]/40 hover:bg-slate-50" : "cursor-default"}`}
      >
        <span className="text-[15px] leading-none">📍</span>
        <span className="max-w-[220px] truncate">{label}</span>
        {canSwitch && (
          <span className="text-[10px] text-slate-400 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>▼</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1.5 max-h-80 w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          {isSuperAdmin && (
            <button
              onClick={() => pick("all")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${!selectedId ? "font-bold text-[#0068B7]" : "text-slate-700"}`}
            >
              <span>🌐</span> Tất cả địa điểm
              {!selectedId && <span className="ml-auto text-xs">✓</span>}
            </button>
          )}
          {locations.length === 0 && (
            <p className="px-3 py-3 text-xs text-slate-400">Chưa có địa điểm nào được gán.</p>
          )}
          {locations.map(l => (
            <button
              key={l.id}
              onClick={() => pick(l.id)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${selectedId === l.id ? "font-bold text-[#0068B7]" : "text-slate-700"}`}
            >
              <span>📍</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.name}</span>
                <span className="block truncate font-mono text-[10px] text-slate-400">{l.code}</span>
              </span>
              {selectedId === l.id && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
