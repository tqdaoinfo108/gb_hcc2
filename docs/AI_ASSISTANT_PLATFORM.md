# AI Assistant Platform — Architecture & Implementation Plan

> Intelligent citizen-guidance layer for the Smart Government Kiosk.
> Text chat + voice → intent → procedure recommendation → **launch existing workflow**.
> The AI **recommends and launches**; it never automates outside the Workflow/Selenium engine.

---

## 0. Scope & Guiding Principles

| Principle | Implication |
|---|---|
| AI is a **guidance layer**, not an automation engine | AI only returns `actions[]`; workflow execution stays in the Selenium/Workflow engine |
| **Provider-agnostic** | Ollama, Gemini, OpenAI-compatible, private endpoints — all behind one adapter interface |
| **Async-first** | Every citizen message becomes an `AIJob`; result pushed to kiosk over WebSocket |
| **Session isolation** | One kiosk session = one conversation; no cross-citizen leakage; auto-cleanup on timeout |
| **Citizen-friendly** | No "API / model / runner / OCR / token" wording in the kiosk UI |
| **CMS-configurable** | Runners, prompts, intent keywords, procedure mapping, response templates — all editable without redeploy |

---

## 1. What ALREADY exists (reuse — do not rebuild)

The Prisma schema already contains the bulk of the data model:

| Concern | Existing model(s) |
|---|---|
| Conversation memory | `AIConversation`, `AIMessage`, `AIRecommendation` |
| Intent catalog | `AIIntent` (name, examples, responses JSON) |
| Job tracking | `AIJob` (jobType, status, priority, payloads, retry, timing), `AIWorker` |
| Procedures | `Procedure`, `ProcedureCategory`, `ProcedureVersion`, `ProcedureRequirement`, `ProcedureWorkflow` |
| Workflow engine | `WorkflowTemplate`, `WorkflowStep`, `SeleniumRunner/Session/Job/JobLog/Screenshot` |
| RBAC / audit | `AdminUser`, `Role`, `Permission`, `RolePermission` |
| Sessions | `KioskSession` (1 session ↔ 1 conversation) |

**Gap (new in Phase 1):** a CMS-managed **AI Runner Registry** of *external provider endpoints* (Ollama/Gemini/OpenAI-compatible) the Gateway calls directly — distinct from `AIWorker` (self-registering pull workers).

---

## 2. Service Architecture

```
            ┌──────────────────────────────────────────────────────────┐
  Kiosk     │                      AI GATEWAY                           │
  Client ──▶│  POST /ai/chat  · POST /ai/voice  · WS copydoc/ai events  │
  (chat/    │  - validates kiosk_session_id + citizen context           │
   voice)   │  - creates AIConversation + AIJob (WAITING)               │
            └───────────────┬──────────────────────────────────────────┘
                            │ enqueue
                   ┌────────▼─────────┐
                   │    JOB QUEUE     │  (in-proc async now; BullMQ/Redis later)
                   └────────┬─────────┘
                            │ dequeue
            ┌───────────────▼───────────────┐     selects best runner
            │           AI ROUTER            │────────────────────────┐
            │  score = f(health, priority,   │                        │
            │   latency, load, failureRate)  │                        ▼
            └───────────────┬───────────────┘            ┌────────────────────────┐
                            │ execute                     │   AI RUNNER REGISTRY    │
            ┌───────────────▼───────────────┐             │  (CMS-managed)          │
            │        AI RUNNER POOL          │             │  ai_runners table       │
            │  ┌────────┐┌────────┐┌───────┐ │◀────────────│  + ai_runner_health_logs│
            │  │ Ollama ││ Gemini ││OpenAI │ │             └────────────────────────┘
            │  │adapter ││adapter ││compat │ │
            │  └────────┘└────────┘└───────┘ │             ┌────────────────────────┐
            └───────────────┬───────────────┘             │  AI HEALTH MONITOR      │
                            │ structured result            │  heartbeat / latency /  │
                            ▼                               │  error rate / recover   │
          ┌──────────────────────────────────┐            └────────────────────────┘
          │  ORCHESTRATION (Gateway service)  │
          │  intent → PROCEDURE KNOWLEDGE     │──▶ procedures + procedure_keywords
          │  → build actions[] (chips/cards)  │
          │  → action OPEN_PROCEDURE → WORKFLOW INTEGRATION → Selenium engine
          └──────────────────┬───────────────┘
                             │ save AIMessage + persist result
                             ▼  push over WebSocket
                        Kiosk renders text + chips + procedure cards
```

### Module boundaries (NestJS)

| Module | Responsibility | New / Exists |
|---|---|---|
| `ai-gateway` | Public entry: `/ai/chat`, `/ai/voice`; creates conversation + job; returns/pushes structured response | **new** |
| `ai-runner` (registry) | CRUD over `ai_runners`; **AI Router** selection algorithm | **new** |
| `ai-health` | Heartbeat, periodic health checks, auto-disable/recover | **new** |
| `ai-provider` (adapters) | `OllamaAdapter`, `GeminiAdapter`, `OpenAiCompatAdapter` behind `AiProviderAdapter` interface | **new** |
| `ai-worker` | Existing pull-worker registry + `AIJob` lifecycle | exists |
| `procedures` | Procedure knowledge + keyword mapping (`procedure_keywords`) | exists (+ keywords) |
| `selenium` / workflow | Workflow execution — launched by AI, owns automation | exists |

---

## 3. AI Runner Registry (Phase 1 data model)

```prisma
model AiRunner {
  id              String   @id @default(uuid())
  name            String
  provider        AiProvider          // OLLAMA | GEMINI | OPENAI_COMPAT | PRIVATE
  endpoint        String              // base URL
  modelName       String
  authKey         String?             // encrypted at rest (see §9)
  priority        Int      @default(5)        // lower = preferred
  timeoutMs       Int      @default(30000)
  maxConcurrent   Int      @default(4)
  activeJobs      Int      @default(0)
  capabilities    String[]            // INTENT_DETECTION, QA_RESPONSE, PROCEDURE_MATCH...
  status          AiRunnerStatus @default(ENABLED)   // ENABLED | DISABLED
  health          AiRunnerHealth @default(UNKNOWN)   // HEALTHY | DEGRADED | UNHEALTHY | UNKNOWN
  latencyMs       Float?
  failureRate     Float    @default(0)
  lastCheckAt     DateTime?
  lastOkAt        DateTime?
  consecutiveFails Int     @default(0)
  config          Json?
  version         Int      @default(1)
  tenantId        String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  healthLogs AiRunnerHealthLog[]
  @@index([status, health, priority])
  @@map("ai_runners")
}

model AiRunnerHealthLog {
  id         String   @id @default(uuid())
  runnerId   String
  ok         Boolean
  latencyMs  Float?
  httpStatus Int?
  error      String?
  checkedAt  DateTime @default(now())
  runner     AiRunner @relation(fields: [runnerId], references: [id], onDelete: Cascade)
  @@index([runnerId, checkedAt])
  @@map("ai_runner_health_logs")
}
```

> Convention note: every table uses UUID PK + `createdAt/updatedAt/deletedAt` (soft delete). `status`/`version`/`tenantId` are added where they carry meaning. Audit goes through a central `audit_logs` writer (Phase 5) rather than per-table columns to avoid noise.

---

## 4. AI Router selection algorithm

Among runners that are `ENABLED`, not soft-deleted, `health != UNHEALTHY`, support the required capability, and have `activeJobs < maxConcurrent`:

```
score =  (priority * 100)                // lower priority value wins
       + (latencyMs / 50)                // faster wins
       + (failureRate * 200)             // reliable wins
       + (activeJobs / maxConcurrent*50) // least-loaded wins
pick runner with the LOWEST score
```

- **Fallback**: if the chosen runner errors/timeouts, mark a failure, exclude it, re-pick. Repeat up to N runners; if all fail → `FAILED` job + citizen-friendly fallback message + manual-guidance chips.
- **Tie-break**: lowest `activeJobs`, then most recent `lastOkAt`.

---

## 5. Health Monitoring

- **Active check** (cron, every 30s): per runner, call a cheap liveness probe (`/api/tags` for Ollama, `models` list for OpenAI-compat, lightweight generate for Gemini). Record `AiRunnerHealthLog`, update `latencyMs`, `failureRate` (rolling), `health`, `lastOkAt`.
- **Passive signals**: each real job updates latency + consecutiveFails.
- **Auto-disable**: `consecutiveFails >= 3` → `health = UNHEALTHY` (router skips it).
- **Auto-recover**: a later successful probe → `health = HEALTHY`, `consecutiveFails = 0`.

---

## 6. Async job flow & states

```
client message → AIConversation (find/create by sessionId)
              → AIJob(status=WAITING)        [enqueue]
              → worker picks → PROCESSING
              → Router picks runner → adapter.generate()
              → COMPLETED (outputPayload) | FAILED | TIMEOUT | CANCELLED
              → save AIMessage(role=ASSISTANT) + AIRecommendation
              → push result to kiosk over WebSocket (device namespace)
```

States: `WAITING · PROCESSING · COMPLETED · FAILED · TIMEOUT · CANCELLED`.
Retry: exponential backoff, `retryCount` capped (default 2); each attempt may pick a different runner (fallback).

*(The existing `AIJob.status` enum `JobStatus` is reused; WAITING maps to `PENDING/QUEUED`. A thin status mapping keeps the public contract clean.)*

---

## 7. Intent → Procedure → Workflow mapping

1. **Intent detection**: runner returns `{ intent, confidence, entities[] }` using a CMS prompt + the `AIIntent` catalog as few-shot examples.
2. **Procedure match**: citizen phrase normalised (diacritic-insensitive, reusing `normalizeVi`) and matched against **`procedure_keywords`** (new lightweight table) → `procedure_id`. Falls back to semantic match via the runner if no keyword hit.
   - "tôi muốn làm giấy khai sinh" → `KHAISINH`
   - "tôi cần đăng ký kết hôn" → `KETHON`
   - "tôi muốn sao y giấy tờ" → CopyDoc service
3. **Build actions**: from the matched procedure →
   ```json
   { "type": "OPEN_PROCEDURE", "label": "Nộp hồ sơ ngay", "procedure_id": "PROC001" }
   { "type": "VIEW_REQUIREMENTS", "label": "Xem hồ sơ cần chuẩn bị", "procedure_id": "PROC001" }
   { "type": "SEARCH_PROCEDURE", "label": "Tra cứu thủ tục" }
   ```
4. **On chip select**: kiosk calls the **Workflow Integration Service**, which launches the existing `WorkflowTemplate` / Selenium job for that procedure. AI does not drive the browser.

---

## 8. Structured response contract

```jsonc
{
  "conversationId": "uuid",
  "message": "Tôi đã tìm thấy thủ tục phù hợp với yêu cầu của bạn.",
  "intent": "REGISTER_BIRTH",
  "confidence": 0.92,
  "procedure": {
    "procedure_id": "PROC001",
    "name": "Đăng ký khai sinh",
    "agency": "UBND phường",
    "slaWorkDays": 5,
    "requirements": ["CMND/CCCD cha mẹ", "Giấy chứng sinh"]
  },
  "actions": [
    { "type": "OPEN_PROCEDURE",    "label": "Nộp hồ sơ ngay",          "procedure_id": "PROC001" },
    { "type": "VIEW_REQUIREMENTS", "label": "Xem hồ sơ cần chuẩn bị",  "procedure_id": "PROC001" },
    { "type": "SEARCH_PROCEDURE",  "label": "Tra cứu thủ tục" }
  ],
  "ui": { "cards": ["procedure"], "voice": true }
}
```

Action types: `OPEN_PROCEDURE · VIEW_REQUIREMENTS · SEARCH_PROCEDURE · START_COPYDOC · ASK_CLARIFY · HUMAN_HELP`.

---

## 9. Security & isolation rules

- `kiosk_session_id` required on every gateway call; conversation is bound to it; queries always filter by session → **no cross-citizen leakage**.
- Session timeout → conversation `endedAt` set, transient context purged (cron cleanup).
- Runner `authKey` **encrypted at rest** (AES-GCM via `APP_ENCRYPTION_KEY`); never returned to CMS in plaintext (write-only field; UI shows "••••").
- All CMS mutations write `audit_logs` (actor, action, entity, before/after, ip).
- Citizen-facing text passes a **terminology filter** (no "API/model/runner/OCR/token"); internal errors mapped to friendly messages.
- Provider calls server-side only; citizen data never sent to a provider not enabled by an admin.

---

## 10. Kiosk UI states (AI Assistant)

`IDLE → LISTENING(voice waveform) → THINKING("Đang tìm thủ tục phù hợp…") → ANSWER(text+chips+cards) → ACTION(launch workflow) → ERROR/RETRY → FALLBACK(human help)`

- Full-screen chat, friendly assistant avatar, large Vietnamese text, mic button + waveform, suggestion chips, procedure cards, "**Nộp hồ sơ ngay**" CTA.
- Loading copy: "Đang tìm thủ tục phù hợp", "Tôi đã tìm thấy dịch vụ bạn cần". Never expose technical terms.

---

## 11. CMS modules

| Module | Backed by |
|---|---|
| AI Runner Management (CRUD providers) | `ai_runners` |
| AI Monitoring Dashboard | `ai_runners` + `ai_runner_health_logs` + `ai_jobs` |
| AI Prompt Management (versioned) | `ai_prompts` *(Phase 4)* |
| Intent Keyword Management | `ai_intents` + `procedure_keywords` |
| Procedure / Workflow Mapping | `procedures` ↔ `workflow_templates` |
| AI Response Template Management | `ai_response_templates` *(Phase 4)* |
| AI Usage Reports | `ai_jobs` aggregates |

---

## 12. Phased implementation plan

| Phase | Deliverable | Status |
|---|---|---|
| **1** | AI Runner Registry schema + migration · provider adapters (Ollama/Gemini/OpenAI-compat) · AI Router · Health Monitor · `/ai/chat` orchestration · CMS runner CRUD API | **this turn** |
| 2 | CMS pages: AI Runner Management + Monitoring Dashboard | next |
| 3 | Kiosk AI Assistant UI (full-screen chat, chips, procedure cards, loading/retry/fallback states) | next |
| 4 | Voice flow (STT) · Prompt Management (versioned) · Response Template Management | next |
| 5 | `procedure_keywords` admin · Intent Keyword Management · Audit log writer · BullMQ/Redis queue · usage reports | next |

---

## 12b. Flow Convergence — Manual + AI → one pipeline (IMPLEMENTED)

Both citizen entry flows resolve to a **single** launch entry, so submission
logic is never duplicated:

```
Manual "Nộp hồ sơ"  ─┐
  browse/search →     │   POST /workflows/launch
  procedure detail →  ├──▶ { kioskSessionId, procedureId, source }
  "Nộp hồ sơ ngay"    │            │
AI chat / voice ─────┘            ▼
  intent → procedure →    WorkflowLaunchService.launch()
  OPEN_PROCEDURE chip →     - resolve published WorkflowTemplate by procedureId
  POST /ai/action           - snapshot citizen profile for field mapping
                            - SeleniumJobService.dispatch()  ◀── the ONE pipeline
                                   │
                                   ▼
                  isolated SeleniumSession + queued SeleniumJob
                  (runner pool · priority · retry · logs · screenshots ·
                   citizen-input for VNeID/OTP/CAPTCHA · progress over WS)
```

- **Single source of truth**: `WorkflowLaunchService` is the only code path from a
  `procedure_id` to a running workflow. `source` (`MANUAL`/`AI`/`VOICE`) is recorded
  on the job for analytics but does not branch the logic.
- **Readiness gate**: `GET /workflows/resolve/:procedureId` returns `online: true|false`
  so the kiosk shows "Nộp hồ sơ ngay" only when a published template + steps exist;
  otherwise a friendly "chưa hỗ trợ nộp trực tuyến" message.
- **CMS-configurable steps** (`WorkflowStep.stepType`): semantic types operators use —
  `OPEN_URL · CLICK_MENU · SEARCH_PROCEDURE · SELECT_RESULT · WAIT_VNEID_LOGIN ·
  INPUT_FIELD · SELECT_OPTION · UPLOAD_DOCUMENT · WAIT_SUBMIT · DETECT_SUCCESS_TEXT ·
  EXTRACT_APPLICATION_CODE · COMPLETE` — plus low-level primitives for power users.
  Field mapping via `inputValue` templates like `{{citizen.fullName}}`.
- **Upload Manager hook**: `UPLOAD_DOCUMENT` steps pause the runner and request a file
  from the kiosk (scanner / mobile QR capture — already built in the CopyDoc flow:
  4-corner detect, crop, rotate, enhance / digital wallet), then resume the upload.

### API contracts (convergence)
```
GET  /workflows/resolve/:procedureId   → { procedure{...}, online, workflow{ stepCount } }
POST /workflows/launch  { kioskSessionId, procedureId, citizenId?, deviceSerial?, source, formData? }
                                        → { jobId, status, runnerAssigned, workflow }
POST /ai/action         { type:"OPEN_PROCEDURE", procedureId, kioskSessionId, ... }
                                        → delegates to /workflows/launch (source=AI)
```

## 13. API contracts (Phase 1)

```
# Kiosk
POST /ai/chat        { kioskSessionId, citizenId?, message, language? }   → structured response (§8)
POST /ai/voice       multipart audio + { kioskSessionId } (Phase 4 STT)   → structured response

# CMS — AI Runner Registry
GET    /ai-runners
POST   /ai-runners        { name, provider, endpoint, modelName, authKey?, priority?, timeoutMs?, maxConcurrent?, capabilities? }
PATCH  /ai-runners/:id
DELETE /ai-runners/:id     (soft delete)
POST   /ai-runners/:id/health-check     → runs probe now
GET    /ai-runners/:id/health-logs
```
