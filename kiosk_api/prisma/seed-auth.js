/* Seed authentication: roles + test admin users (password 123456) + location scope.
 * Run:  node prisma/seed-auth.js
 * Idempotent — safe to re-run. */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash('123456', 10);

  // ── Roles ──────────────────────────────────────────────────────────────────
  const superRole = await prisma.role.upsert({
    where: { code: 'SUPER_ADMIN' },
    update: { name: 'Quản trị hệ thống', isSystem: true },
    create: { code: 'SUPER_ADMIN', name: 'Quản trị hệ thống', description: 'Toàn quyền trên mọi địa điểm', isSystem: true },
  });
  const locRole = await prisma.role.upsert({
    where: { code: 'LOCATION_ADMIN' },
    update: { name: 'Quản trị địa điểm', isSystem: true },
    create: { code: 'LOCATION_ADMIN', name: 'Quản trị địa điểm', description: 'Quản lý các địa điểm được phân công', isSystem: true },
  });

  // ── A location to scope the branch admin to ─────────────────────────────────
  let location = await prisma.kioskLocation.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } });
  if (!location) {
    location = await prisma.kioskLocation.create({
      data: {
        code: 'CUANAM',
        name: 'UBND Phường Cửa Nam',
        address: 'Quận Hoàn Kiếm, Hà Nội',
        district: 'Hoàn Kiếm',
        province: 'Hà Nội',
        isActive: true,
      },
    });
  }

  // ── Users ────────────────────────────────────────────────────────────────--
  // Super admin (manages everything)
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@hcc.vn' },
    update: { passwordHash, isActive: true, isSuperAdmin: true, fullName: 'Quản trị hệ thống' },
    create: {
      username: 'admin', email: 'admin@hcc.vn', passwordHash,
      fullName: 'Quản trị hệ thống', isActive: true, isSuperAdmin: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
    update: {}, create: { userId: admin.id, roleId: superRole.id },
  });

  // Location admin (manages only the assigned location)
  const branch = await prisma.adminUser.upsert({
    where: { email: 'cuanam@hcc.vn' },
    update: { passwordHash, isActive: true, isSuperAdmin: false, fullName: 'Quản trị Cửa Nam' },
    create: {
      username: 'cuanam', email: 'cuanam@hcc.vn', passwordHash,
      fullName: 'Quản trị Cửa Nam', isActive: true, isSuperAdmin: false,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: branch.id, roleId: locRole.id } },
    update: {}, create: { userId: branch.id, roleId: locRole.id },
  });
  await prisma.userLocation.upsert({
    where: { userId_locationId: { userId: branch.id, locationId: location.id } },
    update: {}, create: { userId: branch.id, locationId: location.id },
  });

  // Default module access for the branch admin (everything except user/audit admin).
  const branchModules = [
    'dashboard', 'locations', 'home_services', 'devices', 'remote_debug',
    'queue', 'copydoc', 'feedback',
  ];
  for (const m of branchModules) {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: branch.id, module: m } },
      update: {}, create: { userId: branch.id, module: m },
    });
  }

  console.log('✓ Seeded auth.');
  console.log('  Super admin    → email: admin@hcc.vn    | password: 123456');
  console.log(`  Location admin → email: cuanam@hcc.vn   | password: 123456  (location: ${location.name})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
