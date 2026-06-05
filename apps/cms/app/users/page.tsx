import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader, StatusBadge } from "../components";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { roles: { include: { role: true } } }
  });

  return (
    <div>
      <PageHeader title="User Management" description="RBAC users, roles, and permissions stored in PostgreSQL." />
      {users.length === 0 ? (
        <EmptyState title="No admin users" detail="Create admin users through your secure provisioning workflow." />
      ) : (
        <div className="grid gap-4">
          {users.map((user) => (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={user.id}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{user.fullName}</h2>
                  <p className="text-sm text-slate-500">{user.email}</p>
                </div>
                <StatusBadge status={user.status.toLowerCase()} />
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Roles {user.roles.map((role) => role.role.name).join(", ") || "No roles"}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
