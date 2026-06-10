import type { Metadata } from "next";
import "./globals.css";
import { NavSidebar } from "./NavSidebar";

export const metadata: Metadata = {
  title: "Kiosk CMS — Trung tâm điều hành",
  description: "Admin Control Center — Smart Government Kiosk Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning>
        <main className="shell">
          <aside className="sidebar">
            {/* Brand */}
            <div className="mb-6 flex items-center gap-3">
              <div className="primary-bg grid h-11 w-11 place-items-center rounded-2xl
                              text-sm font-black text-white">
                CMS
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950">Kiosk CMS</p>
                <p className="text-xs text-slate-500">Trung tâm điều hành</p>
              </div>
            </div>

            <NavSidebar />
          </aside>
          <section className="content">{children}</section>
        </main>
      </body>
    </html>
  );
}
