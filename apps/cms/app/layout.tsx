import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Kiosk CMS",
  description: "Admin Control Center for Smart Government Kiosk Platform"
};

const nav = [
  ["Dashboard", "/"],
  ["Device Fleet", "/devices"],
  ["Workflow Editor", "/workflows"],
  ["Selector Editor", "/selectors"],
  ["OTA Manager", "/ota"],
  ["Remote Debug", "/remote-debug"],
  ["AI Monitor", "/ai-monitor"],
  ["Users", "/users"]
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <main className="shell">
          <aside className="sidebar">
            <div className="mb-8 flex items-center gap-3">
              <div className="primary-bg grid h-11 w-11 place-items-center rounded-2xl text-sm font-black text-white">
                SG
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950">Smart Kiosk CMS</p>
                <p className="text-xs text-slate-500">Control Center</p>
              </div>
            </div>
            <nav className="grid gap-1">
              {nav.map(([label, href]) => (
                <a className="nav-link" href={href} key={href}>
                  {label}
                </a>
              ))}
            </nav>
          </aside>
          <section className="content">{children}</section>
        </main>
      </body>
    </html>
  );
}
