# WebSocket Design

Socket.IO namespaces:

- `/cms`
- `/device`
- `/kiosk`

## Events

| Event | Direction | Purpose |
|---|---|---|
| `device_online` | API to CMS | Device connected or sent heartbeat |
| `device_offline` | API to CMS | Device socket disconnected |
| `heartbeat` | Device to API, API to CMS | Store and broadcast device status |
| `command` | CMS to API, API to Device | Remote command delivery |
| `command_result` | Device to API, API to CMS | Command acknowledgement and result |
| `workflow_update` | API to Device | Workflow version deployment |
| `ota_update` | API to Device | OTA deployment notice |
| `remote_debug` | Kiosk to API, API to CMS | Browser state snapshot |
| `error` | Device or kiosk to API, API to CMS | Runtime error event |

## Heartbeat payload

```json
{
  "deviceId": "KIOSK-001",
  "version": "1.0.0",
  "location": "Service Center",
  "ip": "10.0.0.10",
  "status": "online",
  "cpuPercent": 15,
  "ramPercent": 48,
  "diskPercent": 62,
  "temperatureC": 45,
  "currentUrl": "https://dichvucong.gov.vn/",
  "currentStep": "Waiting for workflow"
}
```

The API persists heartbeat data to PostgreSQL before broadcasting to CMS.

## Remote command result

```json
{
  "commandId": "uuid",
  "deviceId": "KIOSK-001",
  "command": "lock",
  "status": "SUCCESS",
  "timestamp": "2026-06-05T00:00:00.000Z"
}
```
