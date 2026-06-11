/**
 * CANONICAL CCCD / CITIZEN VARIABLE CATALOG
 *
 * Single source of truth for the dynamic data that can be filled into a portal
 * form during workflow execution. Both the runner (resolveTemplate) and the CMS
 * recorder (auto-binding + variable picker) refer to these keys, so a binding
 * like `{{citizen.province}}` always resolves to the same field of the CCCD
 * profile snapshot built in WorkflowLaunchService.
 *
 * `match` holds normalized tokens (lowercase, no diacritics) used by the recorder
 * to AUTO-DETECT which variable a portal field corresponds to — e.g. a <select>
 * whose name is "tinh_thanhpho" auto-binds to {{citizen.province}} instead of
 * hard-coding the value the admin happened to pick while recording.
 */

export interface CitizenVariable {
  key: string;        // template key, e.g. "citizen.province"
  label: string;      // human label shown in the picker
  group: string;      // grouping in the picker UI
  example: string;    // sample value to illustrate
  fromCccd: boolean;  // true → read directly off the CCCD chip / scan
  match: string[];    // normalized field-name tokens for auto-binding
}

export const CITIZEN_VARIABLES: CitizenVariable[] = [
  // ── Identity (CCCD) ──────────────────────────────────────────────────────
  {
    key: 'citizen.fullName', label: 'Họ và tên', group: 'Định danh (CCCD)',
    example: 'Nguyễn Văn An', fromCccd: true,
    match: ['hoten', 'hovaten', 'fullname', 'name', 'hovatendaydu', 'tendaydu'],
  },
  {
    key: 'citizen.nationalId', label: 'Số CCCD / Định danh', group: 'Định danh (CCCD)',
    example: '001099012345', fromCccd: true,
    match: ['cccd', 'cmnd', 'sococcd', 'socmnd', 'nationalid', 'idcard', 'sodinhdanh', 'madinhdanh', 'sogiayto'],
  },
  {
    key: 'citizen.dateOfBirth', label: 'Ngày sinh', group: 'Định danh (CCCD)',
    example: '1990-05-12', fromCccd: true,
    match: ['ngaysinh', 'dob', 'dateofbirth', 'birthday', 'namsinh'],
  },
  {
    key: 'citizen.gender', label: 'Giới tính', group: 'Định danh (CCCD)',
    example: 'Nam', fromCccd: true,
    match: ['gioitinh', 'gender', 'sex'],
  },

  // ── Residence address (CCCD) ─────────────────────────────────────────────
  {
    key: 'citizen.province', label: 'Tỉnh / Thành phố', group: 'Nơi thường trú (CCCD)',
    example: 'Hà Nội', fromCccd: true,
    match: ['tinh', 'thanhpho', 'tinhthanhpho', 'tinhtp', 'province', 'city', 'matinh'],
  },
  {
    key: 'citizen.district', label: 'Quận / Huyện', group: 'Nơi thường trú (CCCD)',
    example: 'Cầu Giấy', fromCccd: true,
    match: ['quan', 'huyen', 'quanhuyen', 'district', 'thixa', 'maquan', 'mahuyen'],
  },
  {
    key: 'citizen.ward', label: 'Phường / Xã', group: 'Nơi thường trú (CCCD)',
    example: 'Dịch Vọng', fromCccd: true,
    match: ['phuong', 'xa', 'phuongxa', 'ward', 'commune', 'thitran', 'maphuong', 'maxa'],
  },
  {
    key: 'citizen.address', label: 'Địa chỉ chi tiết (số nhà, đường)', group: 'Nơi thường trú (CCCD)',
    example: 'Số 1, đường Trần Duy Hưng', fromCccd: true,
    match: ['diachi', 'address', 'sonha', 'duong', 'diachichitiet', 'diachithuongtru', 'noithuongtru'],
  },

  // ── Contact (kiosk session) ──────────────────────────────────────────────
  {
    key: 'citizen.phone', label: 'Số điện thoại', group: 'Liên hệ',
    example: '0901234567', fromCccd: false,
    match: ['sodienthoai', 'dienthoai', 'phone', 'mobile', 'sdt', 'tel'],
  },
  {
    key: 'citizen.email', label: 'Email', group: 'Liên hệ',
    example: 'an.nguyen@email.vn', fromCccd: false,
    match: ['email', 'thudientu', 'mail'],
  },
  {
    key: 'citizen.vneidId', label: 'Mã tài khoản VNeID', group: 'Liên hệ',
    example: 'VNEID-0010990', fromCccd: false,
    match: ['vneid', 'mavneid', 'taikhoanvneid'],
  },
];

/** Strip diacritics + non-alphanumerics → lowercase token, for fuzzy field matching. */
export function normalizeToken(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Auto-detect which citizen variable a portal field corresponds to.
 * Inspects the field's name/id/placeholder/label text.
 * @returns the matching variable key (e.g. "citizen.province") or null.
 */
export function guessCitizenBinding(hints: {
  name?: string; id?: string; placeholder?: string; label?: string; ariaLabel?: string;
}): string | null {
  const haystack = normalizeToken(
    [hints.name, hints.id, hints.placeholder, hints.label, hints.ariaLabel].filter(Boolean).join(' '),
  );
  if (!haystack) return null;

  // Longest match tokens first so "tinhthanhpho" beats "tp", "diachi" beats "dia".
  let best: { key: string; len: number } | null = null;
  for (const v of CITIZEN_VARIABLES) {
    for (const tok of v.match) {
      if (haystack.includes(tok) && (!best || tok.length > best.len)) {
        best = { key: v.key, len: tok.length };
      }
    }
  }
  return best?.key ?? null;
}
