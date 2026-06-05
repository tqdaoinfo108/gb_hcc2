# API Design

Swagger is exposed at:

```text
http://127.0.0.1:4000/docs
```

## Auth API

- `POST /auth/login`

Reads users, roles, and permissions from PostgreSQL. No default admin user is inserted by migration.

## Device API

- `GET /devices`
- `GET /devices/dashboard`
- `GET /devices/:deviceId`

Device health is stored by heartbeat events and read from `devices` and `device_status`.

## Command API

- `POST /commands`

Supported commands:

- `restart_app`
- `restart_device`
- `lock`
- `unlock`
- `clear_cache`
- `capture_screen`
- `push_workflow`
- `update_config`

Every command creates a `device_command` row and emits a Socket.IO command to the connected device when available.

## Workflow API

- `GET /workflows`
- `POST /workflows`
- `GET /workflows/:slug`
- `GET /workflows/:slug/active`
- `POST /workflows/:slug/versions`

Workflow versions are stored as JSON definitions plus normalized `workflow_step` rows.

## Selector API

- `GET /selectors`
- `POST /selectors`
- `POST /selectors/:selectorKey/versions`

Selector versions can be activated from CMS without kiosk deployment.

## OTA API

- `GET /ota/packages`
- `POST /ota/packages`
- `POST /ota/deployments`
- `GET /ota/check/:deviceId`

## Automation API

- `GET /automation/sessions`
- `GET /automation/sessions/:sessionId/logs`
- `POST /automation/logs`

## AI API

- `GET /ai/conversations`
- `POST /ai/conversations`
