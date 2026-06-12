"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserMenu({
  fullName,
  email,
  isSuperAdmin,
  scope,
}: {
  fullName: string;
  email: string;
  isSuperAdmin: boolean;
  scope: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const initials = fullName
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  async function logout() {
    setBusy(true);
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
          style={{ background: "#0068B7" }}
        >
          {initials || "U"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{fullName}</p>
          <p className="truncate text-[11px] text-slate-500">
            {isSuperAdmin ? "Quản trị hệ thống" : "Quản trị địa điểm"} · {scope}
          </p>
        </div>
      </div>
      <button
        onClick={logout}
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        {busy ? "Đang đăng xuất…" : "↩ Đăng xuất"}
      </button>
    </div>
  );
}
