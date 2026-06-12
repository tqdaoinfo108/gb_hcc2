"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Đăng nhập thất bại.");
      router.replace("/");
      router.refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Đăng nhập thất bại.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 px-4">
      {/* Ambient brand background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% -10%, rgba(0,104,183,0.10), transparent 60%), radial-gradient(50rem 40rem at 110% 110%, rgba(0,104,183,0.08), transparent 55%)",
        }}
      />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:grid-cols-2">
        {/* ── Left brand panel ─────────────────────────────────── */}
        <div
          className="relative hidden flex-col justify-between p-10 text-white md:flex"
          style={{ background: "linear-gradient(160deg, #0068B7 0%, #004e8a 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-lg font-black backdrop-blur">
              HC
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide opacity-90">HỆ THỐNG DỊCH VỤ CÔNG</p>
              <p className="text-xs opacity-70">Trung tâm điều hành thông minh</p>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-black leading-tight">
              Kiosk CMS
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/80">
              Quản lý kiosk, dịch vụ công, sao y tài liệu và vận hành theo từng địa điểm — tập trung tại một nơi.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Theo địa điểm", "Phân quyền", "Thời gian thực"].map((t) => (
                <span key={t} className="rounded-full bg-white/12 px-3 py-1 text-xs font-medium backdrop-blur">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/60">© 2026 · Trung tâm Phục vụ Hành chính công</p>
        </div>

        {/* ── Right form panel ─────────────────────────────────── */}
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <div className="mb-8">
            <div className="mb-5 inline-grid h-12 w-12 place-items-center rounded-2xl text-sm font-black text-white md:hidden"
                 style={{ background: "#0068B7" }}>
              CMS
            </div>
            <h2 className="text-2xl font-black text-slate-900">Đăng nhập</h2>
            <p className="mt-1.5 text-sm text-slate-500">Sử dụng tài khoản quản trị được cấp.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hcc.vn"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0068B7] focus:bg-white focus:ring-4 focus:ring-[#0068B7]/12"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-[#0068B7] focus:bg-white focus:ring-4 focus:ring-[#0068B7]/12"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {show ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </div>

            {err && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <span>⚠</span>
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
              style={{ background: "#0068B7" }}
            >
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Hệ thống dành cho cán bộ được phân quyền. Mọi thao tác đều được ghi nhật ký.
          </p>
        </div>
      </div>
    </div>
  );
}
