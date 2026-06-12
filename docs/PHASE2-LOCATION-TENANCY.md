# Phase 2 — Đa địa điểm (Location-based multi-tenancy) cho CMS

> 1 địa điểm → nhiều kiosk. Mỗi địa điểm cấu hình & quản lý riêng. Super admin xem
> tất cả + chuyển địa điểm; Location admin chỉ thấy địa điểm được gán.

## Nguyên tắc scope dữ liệu
| Module | Scope theo địa điểm? | Đường liên kết |
|---|---|---|
| Địa điểm (`/kiosk-locations`) | Root — super admin quản lý; location admin chỉ thấy của mình | `KioskLocation` |
| Kiosk › Thiết bị (`/devices`) | ✅ | `KioskDevice.locationId` |
| Kiosk › Màn hình Home (`/home-services`) | ✅ (cần thêm `locationId`, null = mặc định chung) | `KioskHomeService.locationId` |
| Kiosk › OTA / Remote Debug | ✅ (theo thiết bị) | qua `KioskDevice.locationId` |
| Đánh giá (`/feedback`) | ✅ | `Feedback.session.device.locationId` |
| Sao y tài liệu (`/copy-doc*`) | ✅ | `CopyDocRequest.kioskDeviceId → location` |
| Dashboard (`/`) | ✅ (tổng hợp theo scope) | nhiều nguồn |
| Dịch vụ công (Hồ sơ/Thủ tục/Danh mục/Quy trình/Công dân) | ❌ tạm CHUNG | — |
| Hàng đợi (`/queue`) | ❌ tạm CHUNG (service/counter toàn cục) | — |
| Người dùng (`/users`) | ✅ quản lý gán user↔địa điểm | `UserLocation` |

## Cơ chế
- **Session scope** (server): `lib/session.ts` đọc cookie `hcc_user` + `hcc_loc` →
  `{ user, isSuperAdmin, locationIds, selectedLocationId, scopeLocationIds }`.
  - Super admin: `scopeLocationIds = null` (tất cả) hoặc `[selected]` nếu đã chọn.
  - Location admin: `scopeLocationIds = user.locationIds ∩ (selected || all-of-mine)`.
- **Location switcher** (top bar): chọn địa điểm → set cookie `hcc_loc` → reload.
  Super admin có lựa chọn "Tất cả địa điểm".
- Các hàm trong `lib/data.ts` nhận `scopeLocationIds: string[] | null` và chèn
  `where` lọc theo địa điểm (null = không lọc).

## Các bước (từng trang)
1. [x] Pha 1: Auth thật + login + middleware + cookie + role + UserLocation + Địa điểm ra root.
2. [x] Foundation: `lib/session.ts` (getScope) + `LocationSwitcher` + top bar trong layout.
3. [x] `/kiosk-locations`: location admin chỉ thấy địa điểm của mình.
4. [x] `/devices`: lọc theo địa điểm.
5. [x] `/feedback`: lọc theo địa điểm (session→device→location).
6. [x] `/copy-doc`, `/copy-doc/requests`: lọc theo địa điểm (kioskDeviceId∈thiết bị).
7. [x] Dashboard: số liệu theo scope.
8. [x] `/users`: quản lý người dùng + gán địa điểm + vai trò (chỉ super admin). API: `/admin/users` CRUD.
9. [x] `/home-services`: thêm `KioskHomeService.locationId` (migration 2 phía + API getVisible/getAll/seed/create/delete theo location, fallback global; kiosk client truyền `locationId`; CMS cấu hình theo địa điểm đang chọn).
10. [x] Remote Debug (Phiên làm việc): lọc theo `device.locationId`. OTA = "Tích hợp hệ thống" toàn cục (không theo địa điểm) → giữ nguyên.
11. [x] Top bar location-aware (LocationSwitcher + vai trò) + dashboard scoped. (Redesign trực quan sâu hơn: tuỳ chọn về sau.)

## Bổ sung (theo yêu cầu sau)
12. [x] **Hàng đợi theo địa điểm**: `QueueService.locationId` (null=chung); API `GET /queue/services?locationId=` + `POST /queue/seed?locationId=` + create theo location, fallback global; kiosk `QueueScreen` truyền `locationId`; CMS `/queue` cấu hình theo địa điểm đang chọn.
13. [x] **Loại giấy tờ sao y theo địa điểm**: `CopyDocCategory.locationId` (null=chung); API `GET /copy-doc/categories?locationId=` + create theo location, fallback global; CMS `/copy-doc/categories` (+ overview) theo địa điểm; kiosk copy-doc dùng AI/tĩnh nên không đổi.
14. Dịch vụ công (thủ tục + danh mục thủ tục) **giữ CHUNG** theo xác nhận của bạn.

## Trạng thái
**Pha 2 HOÀN TẤT (13/13 + queue/copydoc per-location).** Auth + scope + switcher + tất cả trang scoped (Dashboard, Thiết bị, Đánh giá, Sao y, Phiên, Địa điểm, Màn hình Home theo địa điểm) + quản lý user theo địa điểm + RBAC.
Đã verify: home-services per-location + fallback; user-location scope; /users chặn location admin.
