/* Seed a few representative administrative procedures so the AI Assistant
   can map common citizen phrases to a procedure_id.
   Run: node prisma/seed-procedures.js  (idempotent — upsert by code). */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATS = [
  { code: 'HOTICH', name: 'Hộ tịch' },
  { code: 'CUTRU',  name: 'Cư trú' },
  { code: 'DATDAI', name: 'Đất đai' },
];

const PROCS = [
  {
    code: 'KHAISINH', categoryCode: 'HOTICH', name: 'Đăng ký khai sinh',
    processingAgency: 'UBND cấp xã/phường', slaWorkDays: 1, fee: 0,
    requirements: ['Tờ khai đăng ký khai sinh', 'Giấy chứng sinh', 'CCCD cha/mẹ'],
  },
  {
    code: 'KETHON', categoryCode: 'HOTICH', name: 'Đăng ký kết hôn',
    processingAgency: 'UBND cấp xã/phường', slaWorkDays: 1, fee: 0,
    requirements: ['Tờ khai đăng ký kết hôn', 'CCCD hai bên', 'Giấy xác nhận tình trạng hôn nhân'],
  },
  {
    code: 'KHAITU', categoryCode: 'HOTICH', name: 'Đăng ký khai tử',
    processingAgency: 'UBND cấp xã/phường', slaWorkDays: 1, fee: 0,
    requirements: ['Tờ khai đăng ký khai tử', 'Giấy báo tử'],
  },
  {
    code: 'TAMTRU', categoryCode: 'CUTRU', name: 'Đăng ký tạm trú',
    processingAgency: 'Công an cấp xã/phường', slaWorkDays: 3, fee: 0,
    requirements: ['Tờ khai thay đổi thông tin cư trú', 'Giấy tờ chứng minh chỗ ở hợp pháp'],
  },
  {
    code: 'DATDAI_CN', categoryCode: 'DATDAI', name: 'Cấp giấy chứng nhận quyền sử dụng đất',
    processingAgency: 'Văn phòng đăng ký đất đai', slaWorkDays: 30, fee: 0,
    requirements: ['Đơn đăng ký', 'Giấy tờ về quyền sử dụng đất', 'Sơ đồ thửa đất'],
  },
];

async function main() {
  const catId = {};
  for (const c of CATS) {
    const row = await prisma.procedureCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, deletedAt: null },
      create: { code: c.code, name: c.name },
    });
    catId[c.code] = row.id;
  }
  for (const p of PROCS) {
    const proc = await prisma.procedure.upsert({
      where: { code: p.code },
      update: {
        categoryId: catId[p.categoryCode], name: p.name,
        processingAgency: p.processingAgency, slaWorkDays: p.slaWorkDays,
        fee: p.fee, isActive: true, isOnline: true, deletedAt: null,
      },
      create: {
        code: p.code, categoryId: catId[p.categoryCode], name: p.name,
        processingAgency: p.processingAgency, slaWorkDays: p.slaWorkDays,
        fee: p.fee, isActive: true, isOnline: true,
      },
    });
    // reset + insert requirements
    await prisma.procedureRequirement.deleteMany({ where: { procedureId: proc.id } });
    await prisma.procedureRequirement.createMany({
      data: p.requirements.map((name, i) => ({
        procedureId: proc.id, documentType: 'DOC', documentName: name, sortOrder: i,
      })),
    });
    console.log('✓', p.code, '—', p.name);
  }
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
