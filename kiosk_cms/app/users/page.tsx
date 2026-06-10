import { getAdminUsers } from "../lib/data";
import { EmptyState, PageHeader, StatusBadge, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await getAdminUsers();

  return (
    <div>
      <PageHeader title="Quản trị viên" description="RBAC — tài khoản admin, vai trò, quyền hạn, lịch sử đăng nhập." />

      {users.length === 0 ? (
        <EmptyState title="Chưa có người dùng" detail="Tạo tài khoản qua POST /admin/users hoặc seeding." />
      ) : (
        <Table headers={["Tên đầy đủ", "Tên đăng nhập", "Email", "Tổ chức", "Vai trò", "Trạng thái", "Đăng nhập cuối"]}>
          {users.map(u => (
            <tr key={u.id} className="border-t border-slate-100">
              <Td bold>{u.fullName}{u.isSuperAdmin ? " 👑" : ""}</Td>
              <Td><span className="font-mono text-sm">{u.username}</span></Td>
              <Td>{u.email}</Td>
              <Td>{u.organization?.name ?? "—"}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {u.userRoles.length > 0
                    ? u.userRoles.map(ur => (
                        <span key={ur.id} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600">{ur.role.code}</span>
                      ))
                    : <span className="text-xs text-slate-400">Không có vai trò</span>
                  }
                </div>
              </Td>
              <Td><StatusBadge status={u.isActive ? "active" : "offline"} /></Td>
              <Td>{fmt(u.lastLoginAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
