import { PageHeader, EmptyState } from "../components";
import { getScope } from "../lib/session";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export default async function UsersPage() {
  const { isSuperAdmin } = await getScope();

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Người dùng" description="Quản trị tài khoản, vai trò và phân quyền theo địa điểm." />
        <EmptyState
          title="Không có quyền truy cập"
          detail="Chỉ quản trị hệ thống (Super Admin) mới được quản lý người dùng."
        />
      </div>
    );
  }

  const [users, roles, locations, modules] = await Promise.all([
    load<any[]>("/admin/users", []),
    load<any[]>("/admin/roles", []),
    load<any[]>("/admin/locations", []),
    load<any[]>("/admin/modules", []),
  ]);

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Quản trị tài khoản, vai trò, quyền theo module/service và phạm vi địa điểm."
      />
      <UsersClient
        initialUsers={users as any}
        roles={(roles as any[]).map((r) => ({ id: r.id, code: r.code, name: r.name }))}
        locations={locations as any}
        modules={modules as any}
      />
    </div>
  );
}
