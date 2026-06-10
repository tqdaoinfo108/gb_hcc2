/* ═══ All static kiosk data ═════════════════════════════════ */

export const ANNOUNCEMENTS = [
  "Bắt đầu từ 01/07/2026, toàn bộ hồ sơ hành chính được nộp trực tuyến qua Cổng Dịch vụ công Quốc gia.",
  "Mang theo CCCD gắn chip hoặc tài khoản VNeID để xác thực nhanh chóng trong 30 giây.",
  "Dịch vụ tư vấn trực tuyến hoạt động 24/7 — chạm 'Trợ lý ảo' để được hỗ trợ ngay.",
];

export const SERVICE_CARDS = [
  { id:"submit",   label:"Nộp hồ sơ",       sub:"Thủ tục hành chính trực tuyến", icon:"submit",   color:"var(--blue)",   bg:"var(--blue-lt)",   badge:null },
  { id:"wallet",   label:"Sao y tài liệu",    sub:"Sao y điện tử tại chỗ",         icon:"wallet",   color:"var(--teal)",   bg:"var(--teal-lt)",   badge:null },
  { id:"queue",    label:"Bốc số",           sub:"Lấy số thứ tự phục vụ",         icon:"queue",    color:"var(--orange)", bg:"var(--orange-lt)", badge:null },
  { id:"lookup",   label:"Tra cứu",          sub:"Kiểm tra tiến độ hồ sơ",        icon:"search",   color:"var(--ink-3)",  bg:"var(--ink-8)",     badge:null },
  { id:"ai",       label:"Trợ lý ảo",        sub:"Hỗ trợ thông minh 24/7",        icon:"ai",       color:"var(--purple)", bg:"var(--purple-lt)", badge:null },
  { id:"feedback", label:"Đánh giá dịch vụ", sub:"Góp ý chất lượng phục vụ",     icon:"rate",     color:"var(--green)",  bg:"var(--green-lt)",  badge:null },
] as const;

export type ServiceId = typeof SERVICE_CARDS[number]["id"];

export const AUTH_METHODS = [
  { id:"chip", icon:"chip", title:"Thẻ CCCD có chip",   sub:"Đặt thẻ lên đầu đọc NFC bên dưới",      color:"var(--blue)",   bg:"var(--blue-lt)"   },
  { id:"qr",   icon:"qr",   title:"Mã QR VNeID",        sub:"Mở ứng dụng VNeID và quét mã",           color:"var(--teal)",   bg:"var(--teal-lt)"   },
  { id:"help", icon:"help", title:"Cần hỗ trợ?",        sub:"Nhân viên sẽ hỗ trợ bạn trực tiếp",     color:"var(--orange)", bg:"var(--orange-lt)" },
] as const;

export const PROFILE = {
  name: "Nguyễn Thị Lan Anh",
  dob: "12/08/1988",
  gender: "Nữ",
  id: "079088012345",
  address: "Số 47, Ngõ 62, Phố Nguyễn Chí Thanh, Phường Láng Thượng, Quận Đống Đa, Hà Nội",
  docCount: 6,
  activeApps: 2,
};

export const CATEGORIES = [
  { id:"hotich",    icon:"hotich",    label:"Hộ tịch",        sub:"Khai sinh, kết hôn..." },
  { id:"cutru",     icon:"cutru",     label:"Cư trú",         sub:"Đăng ký thường trú..."  },
  { id:"cccd",      icon:"cccd",      label:"CCCD & Hộ chiếu",sub:"Cấp mới, gia hạn..."   },
  { id:"chungthuc", icon:"chungthuc", label:"Chứng thực",     sub:"Bản sao, chữ ký..."    },
  { id:"datdai",    icon:"datdai",    label:"Đất đai",        sub:"GCN quyền sở hữu..."   },
  { id:"kinhdoanh", icon:"kinhdoanh", label:"Kinh doanh",     sub:"Đăng ký hộ kinh doanh..."},
] as const;

export const AI_SUGGESTIONS = [
  { id:"a1", title:"Cấp lại CCCD bị mất",        sub:"Mất dưới 5 ngày · 1 bước nộp", service:"Cấp lại thẻ căn cước công dân" },
  { id:"a2", title:"Đăng ký khai sinh cho con",   sub:"Miễn phí · 3 ngày làm việc",   service:"Đăng ký khai sinh"              },
  { id:"a3", title:"Chứng thực bản sao hộ khẩu",  sub:"Trong ngày · Lấy ngay",         service:"Chứng thực bản sao"             },
] as const;

export type DocStatus = "verified" | "available" | "missing";

export const WALLET_DOCS = [
  { id:"w1", title:"Căn cước công dân",    sub:"Cấp ngày 10/03/2023",       status:"verified"  as DocStatus, icon:"cccd"    },
  { id:"w2", title:"Giấy khai sinh",        sub:"Bản số hoá từ hộ tịch",     status:"verified"  as DocStatus, icon:"doc"     },
  { id:"w3", title:"Sổ hộ khẩu / Cư trú",  sub:"Cập nhật 05/01/2024",       status:"available" as DocStatus, icon:"cutru"   },
  { id:"w4", title:"Bằng tốt nghiệp THPT", sub:"Số hoá tháng 4/2025",       status:"available" as DocStatus, icon:"doc"     },
  { id:"w5", title:"Giấy đăng ký kết hôn", sub:"Chưa xác thực",             status:"missing"   as DocStatus, icon:"hotich"  },
] as const;

export type ChecklistDoc = { id: string; label: string; done: boolean };
export const CHECKLIST_DOCS: ChecklistDoc[] = [
  { id:"c1", label:"CCCD gốc (bản sao có công chứng)",      done:true  },
  { id:"c2", label:"Giấy khai sinh hoặc Hộ khẩu",           done:true  },
  { id:"c3", label:"Ảnh thẻ 3×4 (2 tấm, nền trắng)",        done:true  },
  { id:"c4", label:"Đơn đề nghị (mẫu DC-01, đã điền đủ)",  done:false },
  { id:"c5", label:"Giấy tờ chứng minh nơi ở hiện tại",     done:false },
];

export const QUEUE_CATEGORIES = [
  { id:"q1", label:"Hộ tịch",    color:"var(--blue)",   icon:"hotich"    },
  { id:"q2", label:"Đất đai",    color:"var(--teal)",   icon:"datdai"    },
  { id:"q3", label:"CCCD",       color:"var(--orange)", icon:"cccd"      },
  { id:"q4", label:"Chứng thực", color:"var(--green)",  icon:"chungthuc" },
] as const;

export const FEEDBACK_TAGS = [
  "Nhân viên thân thiện",
  "Hướng dẫn rõ ràng",
  "Thủ tục đơn giản",
  "Giải quyết nhanh",
  "Cơ sở sạch đẹp",
  "Cần cải thiện",
] as const;

export const LOOKUP_RESULT = {
  code:      "BN-2026-04821",
  service:   "Cấp lại thẻ căn cước công dân",
  applicant: "Nguyễn Thị Lan Anh",
  received:  "05/06/2026 09:12",
  expected:  "16/06/2026",
  office:    "Phòng Cảnh sát QLHC - Công an TP. Hà Nội",
  timeline: [
    { label:"Tiếp nhận hồ sơ",   date:"05/06/2026 09:12", status:"done"    },
    { label:"Thẩm định hồ sơ",   date:"07/06/2026 14:30", status:"done"    },
    { label:"Xử lý tại cơ quan", date:"10/06/2026",        status:"active"  },
    { label:"Trả kết quả",        date:"16/06/2026",        status:"pending" },
  ],
};

export const TICKER = "Thứ Hai - Thứ Sáu: 07:30-17:00  |  Thứ Bảy: 07:30-11:30  |  Hotline: 1900 6017  |  Giải quyết không hẹn đối với thủ tục đơn giản  |  ";
