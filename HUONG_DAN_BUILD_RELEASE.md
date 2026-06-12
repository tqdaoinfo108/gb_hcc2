# Hướng dẫn build release Smart Kiosk

Tài liệu này hướng dẫn build:

1. Bộ release chạy 4 dịch vụ trên Windows Server.
2. Ứng dụng Kiosk Windows dạng file cài đặt MSI.

## 1. Yêu cầu máy build

Cài đặt:

- Windows 10/11 hoặc Windows Server.
- Node.js và npm.
- Rust toolchain (`rustc`, `cargo`) để build MSI.
- Microsoft Visual Studio Build Tools với workload C++.
- WebView2 Runtime.
- WiX Toolset được Tauri tự sử dụng khi đóng gói MSI.

Kiểm tra:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

Mở PowerShell tại thư mục gốc dự án:

```powershell
cd C:\Users\qdaoc\Documents\Git\gb_hcc2
```

## 2. Cài dependency

Tại thư mục gốc:

```powershell
npm install
```

Cài riêng dependency nếu các thư mục dự án chưa có `node_modules`:

```powershell
cd kiosk_api
npm install

cd ..\kiosk_cms
npm install

cd ..\kiosk_client
npm install

cd ..\kiosk_runner
npm install
npx playwright install chromium

cd ..
```

## 3. Cấu hình môi trường

File cấu hình chính:

```text
.env
```

Cổng chạy local/server:

```env
API_PORT=3001
CMS_PORT=3002
KIOSK_PORT=3000

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

API dùng khi build ứng dụng MSI:

```env
TAURI_API_URL=http://apihcc.gvbsoft.vn
TAURI_WS_URL=http://apihcc.gvbsoft.vn
```

Đồng bộ `.env` sang các dự án:

```powershell
node scripts\sync-env.mjs
```

Thông tin PostgreSQL và MinIO được giữ trong `.env`. Không đưa file `.env` chứa mật khẩu lên Git.

## 4. Build bộ release chạy trên Windows Server

Chạy tại thư mục gốc:

```powershell
npm run package:server
```

Lệnh trên sẽ:

- Build Backend NestJS.
- Build Admin CMS.
- Build Client web.
- Đóng gói Runner.
- Copy `.env`, Prisma, uploads và các file runtime.
- Tạo các file BAT khởi động và dừng hệ thống.

Kết quả được tạo tại:

```text
deploy\hcc-server-release
```

Các file quan trọng:

```text
deploy\hcc-server-release\start-all.bat
deploy\hcc-server-release\stop-all.bat
deploy\hcc-server-release\install-deps.bat
```

### Bản release không kèm node_modules

Lệnh mặc định:

```powershell
npm run package:server
```

Sau khi copy lên server, chạy:

```text
install-deps.bat
start-all.bat
```

`start-all.bat` cũng tự gọi `install-deps.bat` nếu chưa có dependency.

### Bản release copy lên là chạy ngay

Để copy luôn `node_modules`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-windows-server-release.ps1 -IncludeNodeModules
```

Bản này có dung lượng lớn hơn. Máy server nên dùng cùng hệ điều hành, kiến trúc CPU và major version Node.js với máy build.

### Khởi chạy trên server

Copy toàn bộ thư mục:

```text
deploy\hcc-server-release
```

sang Windows Server, sau đó chạy:

```text
start-all.bat
```

Hệ thống sẽ mở:

- Client: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Swagger: `http://localhost:3001/docs`
- Admin CMS: `http://localhost:3002`
- Runner: `runner-01`

Dừng toàn bộ:

```text
stop-all.bat
```

## 5. Build ứng dụng Windows MSI

### Build theo cấu hình `.env`

Tại thư mục gốc:

```powershell
cd kiosk_client
npm run tauri:build
```

### Build và chỉ định API release

```powershell
cd kiosk_client

$env:TAURI_API_URL="http://apihcc.gvbsoft.vn"
$env:TAURI_WS_URL="http://apihcc.gvbsoft.vn"

npm run tauri:build
```

Trong quá trình build, hệ thống sẽ:

1. Đặt `TAURI_BUILD=true`.
2. Export Next.js thành static bundle.
3. Build Rust release.
4. Đóng gói ứng dụng Windows dạng MSI.

File kết quả:

```text
kiosk_client\src-tauri\target\release\bundle\msi\Smart Government Kiosk_1.0.0_x64_en-US.msi
```

File EXE chưa đóng gói:

```text
kiosk_client\src-tauri\target\release\smart_kiosk.exe
```

## 6. Kiểm tra MSI sau khi build

Xem thông tin file:

```powershell
Get-Item "kiosk_client\src-tauri\target\release\bundle\msi\Smart Government Kiosk_1.0.0_x64_en-US.msi"
```

Tạo checksum SHA256:

```powershell
Get-FileHash "kiosk_client\src-tauri\target\release\bundle\msi\Smart Government Kiosk_1.0.0_x64_en-US.msi" -Algorithm SHA256
```

Kiểm tra API release đã được nhúng:

```powershell
rg "http://apihcc.gvbsoft.vn" kiosk_client\out
```

## 7. Thay đổi phiên bản MSI

Sửa đồng thời version tại:

```text
kiosk_client\package.json
kiosk_client\src-tauri\Cargo.toml
kiosk_client\src-tauri\tauri.conf.json
```

Ví dụ:

```json
"version": "1.0.1"
```

Sau đó build lại:

```powershell
cd kiosk_client
npm run tauri:build
```

## 8. Lỗi thường gặp

### PowerShell chặn script

Chạy:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

Hoặc:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-windows-server-release.ps1
```

### Port đang được sử dụng

Kiểm tra:

```powershell
Get-NetTCPConnection -LocalPort 3000,3001,3002
```

Dừng bộ dịch vụ cũ:

```text
deploy\hcc-server-release\stop-all.bat
```

### Next.js lỗi chunk hoặc cache

Xóa cache và build lại:

```powershell
Remove-Item kiosk_client\.next -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item kiosk_cms\.next -Recurse -Force -ErrorAction SilentlyContinue

npm run package:server
```

### Runner không mở được Chromium

Chạy:

```powershell
cd kiosk_runner
npx playwright install chromium
```

### Build MSI lỗi Rust hoặc linker

Kiểm tra:

```powershell
rustc --version
cargo --version
```

Cài Visual Studio Build Tools và workload:

```text
Desktop development with C++
```

Sau đó chạy lại:

```powershell
cd kiosk_client
npm run tauri:build
```

## 9. Quy trình release đề xuất

```powershell
cd C:\Users\qdaoc\Documents\Git\gb_hcc2

node scripts\sync-env.mjs
npm run package:server

cd kiosk_client
$env:TAURI_API_URL="http://apihcc.gvbsoft.vn"
$env:TAURI_WS_URL="http://apihcc.gvbsoft.vn"
npm run tauri:build
```

Sau khi hoàn tất, lấy:

```text
deploy\hcc-server-release
kiosk_client\src-tauri\target\release\bundle\msi\Smart Government Kiosk_1.0.0_x64_en-US.msi
```
