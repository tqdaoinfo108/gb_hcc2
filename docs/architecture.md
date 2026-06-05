# Smart Government Kiosk Platform

## Monorepo structure

```text
smart-kiosk-platform/
  apps/
    api/      NestJS REST API and Socket.IO gateway
    cms/      Next.js Admin Control Center
    kiosk/    Next.js kiosk UI with Tauri 2 runtime
  packages/
    config/   Prisma schema, migrations, shared runtime config
    shared-types/
    ui/
  docs/
  scripts/
```

## Runtime architecture

```text
CMS Dashboard
  |
  | Socket.IO /cms
  v
Backend API and Event Gateway
  |
  | Socket.IO /device and /kiosk
  v
Tauri Kiosk Device
  |
  | Tauri IPC
  v
Rust Core and Native Service
  |
  | Automation Bridge
  v
Playwright Chromium
  |
  v
https://dichvucong.gov.vn/
```

## Database schema

Prisma schema lives at:

```text
packages/config/prisma/schema.prisma
```

Migration folder:

```text
packages/config/prisma/migrations/20260605000000_init/
```

Entities:

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `devices`, `device_status`, `device_command`
- `workflow`, `workflow_version`, `workflow_step`
- `selector`, `selector_version`
- `automation_session`, `automation_log`
- `ota_package`, `ota_deployment`
- `ai_conversation`
- `system_config`
- `audit_log`

Startup uses:

```bash
npm run bootstrap
```

This checks database connectivity, runs `prisma migrate deploy`, and generates Prisma Client. It does not reset production data.

## Kiosk architecture

```text
Next.js App Router UI
  |
  | @tauri-apps/api invoke()
  v
Tauri IPC
  |
  v
Rust commands:
  collect_device_metrics
  lock_kiosk
  unlock_kiosk
  clear_session_data
  restart_app
  health_check
```

The kiosk UI does not contain workflow automation logic. It shows session state, browser view, AI panel, and lock mode. Automation runs in `apps/kiosk/automation/automation-service.ts`.

## Browser automation

Automation service uses Playwright. It loads active workflow definitions from the API and resolves selector values from PostgreSQL through the selector API.

Selector priority:

1. `data-testid`
2. `aria-label`
3. `text`
4. `css`
5. `xpath`
6. `image`

Selector values are not hard-coded in kiosk code. When a selector fails, the service captures screenshot and HTML evidence and posts an automation log to PostgreSQL through the API.

## OTA architecture

OTA supports:

- Kiosk application
- Automation engine
- Workflow
- Browser engine
- Configuration

Flow:

```text
check version
download
verify signature
backup
install
restart
health check
rollback on failure
```

Tauri updater is configured in `apps/kiosk/src-tauri/tauri.conf.json`. OTA package and deployment records live in `ota_package` and `ota_deployment`.
