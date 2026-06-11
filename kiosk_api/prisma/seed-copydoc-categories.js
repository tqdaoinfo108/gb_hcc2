/* Seed default copy-doc categories with Vietnamese OCR keywords.
   Run: node prisma/seed-copydoc-categories.js
   Idempotent — upserts by unique `code`. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATS = [
  {
    code: 'CCCD',
    name: 'Căn cước công dân & Hộ chiếu',
    nameEn: 'National ID / Passport',
    icon: 'cccd',
    colorHex: '#EA580C',
    sortOrder: 1,
    pricePerCopy: 20000,
    ocrKeywords: [
      // Mặt trước
      'căn cước công dân', 'căn cước', 'chứng minh nhân dân', 'cmnd', 'cccd',
      'số định danh', 'nơi thường trú', 'quốc tịch', 'quê quán', 'có giá trị đến',
      'citizen identity card', 'identity card', 'hộ chiếu', 'passport',
      // Mặt sau
      'đặc điểm nhân dạng', 'cục cảnh sát', 'cục trưởng', 'bộ công an',
      'quản lý hành chính về trật tự xã hội', 'ngón trỏ', 'ngón trỏ trái', 'ngón trỏ phải',
      'personal identification', 'police department', 'social order',
    ],
    // Mã MRZ máy đọc — rất ổn định kể cả khi ảnh xoay / mờ dấu
    ocrDocTypes: ['CCCD', 'CMND', 'PASSPORT', 'IDVNM', 'IDVN'],
    ocrMinScore: 1,
  },
  {
    code: 'DATDAI',
    name: 'Đất đai & Nhà ở',
    nameEn: 'Land & Housing',
    icon: 'datdai',
    colorHex: '#9333EA',
    sortOrder: 2,
    pricePerCopy: 30000,
    ocrKeywords: [
      'giấy chứng nhận quyền sử dụng đất', 'quyền sử dụng đất', 'sở hữu nhà',
      'quyền sở hữu nhà ở', 'thửa đất', 'sổ đỏ', 'sổ hồng', 'tài sản gắn liền với đất',
    ],
    ocrDocTypes: ['GCNQSDD', 'SODO', 'SOHONG'],
    ocrMinScore: 1,
  },
  {
    code: 'HOTICH',
    name: 'Hộ tịch',
    nameEn: 'Civil Registry',
    icon: 'hotich',
    colorHex: '#2563EB',
    sortOrder: 3,
    pricePerCopy: 15000,
    ocrKeywords: [
      'giấy khai sinh', 'khai sinh', 'giấy chứng nhận kết hôn', 'kết hôn',
      'giấy chứng tử', 'khai tử', 'trích lục', 'hộ tịch',
    ],
    ocrDocTypes: ['KHAISINH', 'KETHON', 'KHAITU'],
    ocrMinScore: 1,
  },
  {
    code: 'CUTRU',
    name: 'Cư trú',
    nameEn: 'Residence',
    icon: 'cutru',
    colorHex: '#0D9488',
    sortOrder: 4,
    pricePerCopy: 10000,
    ocrKeywords: [
      'sổ hộ khẩu', 'hộ khẩu', 'giấy tạm trú', 'tạm trú', 'thường trú',
      'xác nhận cư trú', 'thông tin cư trú',
    ],
    ocrDocTypes: ['HOKHAU', 'TAMTRU'],
    ocrMinScore: 1,
  },
  {
    code: 'KINHDOANH',
    name: 'Đăng ký kinh doanh',
    nameEn: 'Business Registration',
    icon: 'kinhdoanh',
    colorHex: '#475569',
    sortOrder: 5,
    pricePerCopy: 20000,
    ocrKeywords: [
      'giấy chứng nhận đăng ký doanh nghiệp', 'đăng ký kinh doanh', 'đăng ký doanh nghiệp',
      'mã số doanh nghiệp', 'mã số thuế', 'hộ kinh doanh', 'giấy phép kinh doanh',
    ],
    ocrDocTypes: ['DKKD', 'GPKD'],
    ocrMinScore: 1,
  },
  {
    code: 'CHUNGCHI',
    name: 'Bằng cấp & Chứng chỉ',
    nameEn: 'Diplomas & Certificates',
    icon: 'chungthuc',
    colorHex: '#16A34A',
    sortOrder: 6,
    pricePerCopy: 25000,
    ocrKeywords: [
      'bằng tốt nghiệp', 'bằng đại học', 'bằng cử nhân', 'chứng chỉ',
      'học bạ', 'bảng điểm', 'giấy chứng nhận', 'tốt nghiệp',
    ],
    ocrDocTypes: ['BANGCAP', 'CHUNGCHI'],
    ocrMinScore: 1,
  },
];

async function main() {
  for (const c of CATS) {
    await prisma.copyDocCategory.upsert({
      where: { code: c.code },
      update: {
        name: c.name, nameEn: c.nameEn, icon: c.icon, colorHex: c.colorHex,
        sortOrder: c.sortOrder, pricePerCopy: c.pricePerCopy, isActive: true,
        ocrKeywords: c.ocrKeywords, ocrDocTypes: c.ocrDocTypes, ocrMinScore: c.ocrMinScore,
        deletedAt: null,
      },
      create: {
        code: c.code, name: c.name, nameEn: c.nameEn, icon: c.icon, colorHex: c.colorHex,
        sortOrder: c.sortOrder, pricePerCopy: c.pricePerCopy, isActive: true,
        ocrKeywords: c.ocrKeywords, ocrDocTypes: c.ocrDocTypes, ocrMinScore: c.ocrMinScore,
      },
    });
    console.log('✓ upserted', c.code, '—', c.name);
  }
  const total = await prisma.copyDocCategory.count({ where: { deletedAt: null } });
  console.log('Total active categories:', total);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
