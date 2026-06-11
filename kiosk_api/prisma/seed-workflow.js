/* Seed a published workflow template for "Đăng ký khai sinh" targeting
   dichvucong.gov.vn, plus an online Selenium runner, so both the Manual and
   AI flows can launch the shared pipeline. Run: node prisma/seed-workflow.js */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STEPS = [
  { stepType: 'OPEN_URL', name: 'Mở Cổng Dịch vụ công', url: 'https://dichvucong.gov.vn/' },
  { stepType: 'CLICK_MENU', name: 'Mở menu Thủ tục', selector: 'a[href*="thu-tuc"]' },
  { stepType: 'SEARCH_PROCEDURE', name: 'Tìm thủ tục', selector: 'input#search', inputValue: 'Đăng ký khai sinh' },
  { stepType: 'SELECT_RESULT', name: 'Chọn kết quả đúng', selector: '.search-result a' },
  { stepType: 'WAIT_VNEID_LOGIN', name: 'Chờ đăng nhập VNeID', waitFor: '.vneid-logged-in', waitTimeoutMs: 120000 },
  { stepType: 'INPUT_FIELD', name: 'Điền họ tên', selector: '#fullName', inputValue: '{{citizen.fullName}}' },
  { stepType: 'INPUT_FIELD', name: 'Điền số định danh', selector: '#nationalId', inputValue: '{{citizen.nationalId}}' },
  { stepType: 'SELECT_OPTION', name: 'Chọn nơi đăng ký', selector: '#agency', inputValue: 'UBND phường' },
  { stepType: 'UPLOAD_DOCUMENT', name: 'Tải giấy chứng sinh', uploadField: 'birthCertificate' },
  { stepType: 'WAIT_SUBMIT', name: 'Nộp hồ sơ', selector: 'button[type=submit]' },
  { stepType: 'DETECT_SUCCESS_TEXT', name: 'Phát hiện thành công', assertText: 'nộp hồ sơ thành công' },
  { stepType: 'EXTRACT_APPLICATION_CODE', name: 'Lấy mã hồ sơ', selector: '.application-code' },
  { stepType: 'COMPLETE', name: 'Hoàn tất' },
];

async function main() {
  // 1. Online runner so dispatch can assign + create an isolated session
  await prisma.seleniumRunner.upsert({
    where: { runnerId: 'runner-01' },
    update: { status: 'ONLINE', host: 'localhost', lastHeartbeatAt: new Date(), deletedAt: null },
    create: { runnerId: 'runner-01', name: 'Local Runner', host: 'localhost', port: 4444, status: 'ONLINE', capacity: 5, lastHeartbeatAt: new Date() },
  });

  const proc = await prisma.procedure.findUnique({ where: { code: 'KHAISINH' } });
  if (!proc) { console.error('Run seed-procedures.js first'); process.exit(1); }

  const tpl = await prisma.workflowTemplate.upsert({
    where: { code: 'WF_KHAISINH' },
    update: {
      procedureId: proc.id, name: 'Quy trình khai sinh — DVC Quốc gia',
      targetUrl: 'https://dichvucong.gov.vn/', portalCode: 'DVC_QUOC_GIA',
      authMethod: 'VNEID_QR', isActive: true, isPublished: true, publishedAt: new Date(),
      screenshotMode: 'ON_EACH_STEP',
    },
    create: {
      code: 'WF_KHAISINH', procedureId: proc.id, name: 'Quy trình khai sinh — DVC Quốc gia',
      targetUrl: 'https://dichvucong.gov.vn/', portalCode: 'DVC_QUOC_GIA',
      authMethod: 'VNEID_QR', isActive: true, isPublished: true, publishedAt: new Date(),
      screenshotMode: 'ON_EACH_STEP',
    },
  });

  await prisma.workflowStep.deleteMany({ where: { templateId: tpl.id } });
  await prisma.workflowStep.createMany({
    data: STEPS.map((s, i) => ({
      templateId: tpl.id, stepOrder: i + 1, stepType: s.stepType, name: s.name,
      url: s.url, selector: s.selector, waitFor: s.waitFor, waitTimeoutMs: s.waitTimeoutMs ?? 10000,
      inputValue: s.inputValue, uploadField: s.uploadField, assertText: s.assertText,
    })),
  });

  console.log('✓ Runner runner-01 ONLINE');
  console.log('✓ Template WF_KHAISINH →', proc.code, 'with', STEPS.length, 'steps');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
