import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { NavSidebar } from "./NavSidebar";
import { UserMenu } from "./UserMenu";
import { LocationSwitcher } from "./LocationSwitcher";
import { getScope } from "./lib/session";

export const metadata: Metadata = {
  title: "Kiosk CMS — Trung tâm điều hành",
  description: "Admin Control Center — Smart Government Kiosk Platform",
};

interface SessionUser {
  fullName?: string;
  email?: string;
  isSuperAdmin?: boolean;
  locations?: { id: string; name: string }[];
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = (await cookies()).get("hcc_user")?.value;
  let user: SessionUser | null = null;
  try { user = raw ? JSON.parse(raw) : null; } catch { user = null; }

  const scope = user ? await getScope() : null;

  return (
    <html lang="vi">
      <body suppressHydrationWarning>
        {user ? (
          <main className="shell">
            <aside className="sidebar flex flex-col">
              {/* Brand */}
              <div className="mb-6 flex items-center gap-3">
                <div className="primary-bg grid h-11 w-11 place-items-center rounded-2xl text-sm font-black text-white">
                  CMS
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-950">Kiosk CMS</p>
                  <p className="text-xs text-slate-500">Trung tâm điều hành</p>
                </div>
              </div>

              <div className="nice-scroll -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
                <NavSidebar modules={(user as { modules?: string[] }).modules} />
              </div>

              {/* User / logout footer */}
              <UserMenu
                fullName={user.fullName ?? "Người dùng"}
                email={user.email ?? ""}
                isSuperAdmin={!!user.isSuperAdmin}
                scope={
                  user.isSuperAdmin
                    ? "Toàn hệ thống"
                    : (user.locations && user.locations.length
                        ? user.locations.map((l) => l.name).join(", ")
                        : "Chưa gán địa điểm")
                }
              />
            </aside>
            <section className="content flex min-h-0 flex-col p-0">
              {/* Top bar — location context for the whole CMS */}
              <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-7 py-3 backdrop-blur">
                {scope && (
                  <LocationSwitcher
                    locations={scope.availableLocations}
                    selectedId={scope.selectedLocationId}
                    isSuperAdmin={scope.isSuperAdmin}
                  />
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {user.isSuperAdmin ? "Toàn hệ thống" : "Quản trị địa điểm"}
                </span>
              </header>
              <div className="flex-1 px-7 py-6">{children}</div>
            </section>
          </main>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
