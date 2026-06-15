/**
 * Canonical CMS module/service catalog. A non-super user is granted access to a
 * subset of these (UserModuleAccess); the CMS shows/hides nav + pages by module.
 * Super admins implicitly have all modules.
 */
export interface ModuleDef { key: string; label: string; group: string }

export const MODULES: ModuleDef[] = [
  { key: 'dashboard',   label: 'Dashboard',          group: 'Tổng quan' },
  { key: 'locations',   label: 'Địa điểm',           group: 'Địa điểm' },
  { key: 'home_services', label: 'Màn hình Home',     group: 'Kiosk' },
  { key: 'devices',     label: 'Thiết bị',           group: 'Kiosk' },
  { key: 'ota',         label: 'OTA / Tích hợp',     group: 'Kiosk' },
  { key: 'remote_debug', label: 'Điều khiển từ xa',  group: 'Kiosk' },
  { key: 'queue',       label: 'Hàng đợi',           group: 'Hàng đợi' },
  { key: 'applications', label: 'Hồ sơ',             group: 'Dịch vụ công' },
  { key: 'procedures',  label: 'Thủ tục & Danh mục', group: 'Dịch vụ công' },
  { key: 'workflows',   label: 'Quy trình',          group: 'Dịch vụ công' },
  { key: 'citizens',    label: 'Công dân',           group: 'Dịch vụ công' },
  { key: 'copydoc',     label: 'Sao y tài liệu',     group: 'Sao y tài liệu' },
  { key: 'feedback',    label: 'Đánh giá',           group: 'AI & Nội dung' },
  { key: 'ai',          label: 'Trợ lý AI',          group: 'AI & Nội dung' },
  { key: 'selectors',   label: 'Bộ chọn',            group: 'AI & Nội dung' },
  { key: 'users',       label: 'Người dùng',         group: 'Hệ thống' },
  { key: 'audit',       label: 'Nhật ký hệ thống',   group: 'Hệ thống' },
];

export const ALL_MODULE_KEYS = MODULES.map((m) => m.key);
