import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsObject, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  WorkflowAuthMethod,
  ScreenshotMode,
  WorkflowStepType,
  SelectorType,
  StepAction,
  StepFailureAction,
  BrowserType,
  JobStatus,
} from '@prisma/client';

// ─── Workflow Template ───────────────────────────────────────────────────────

export class CreateWorkflowTemplateDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() targetUrl!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() portalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() procedureId?: string;
  @ApiPropertyOptional({ enum: WorkflowAuthMethod }) @IsOptional() @IsEnum(WorkflowAuthMethod) authMethod?: WorkflowAuthMethod;
  @ApiPropertyOptional({ enum: ScreenshotMode }) @IsOptional() @IsEnum(ScreenshotMode) screenshotMode?: ScreenshotMode;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(10) @Max(600) timeoutSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(5) maxRetries?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() configJson?: Record<string, unknown>;
}

export class UpdateWorkflowTemplateDto extends PartialType(CreateWorkflowTemplateDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
}

// ─── Workflow Step ────────────────────────────────────────────────────────────

export class CreateWorkflowStepDto {
  @ApiProperty() @IsInt() @Min(1) stepOrder!: number;
  @ApiProperty({ enum: WorkflowStepType }) @IsEnum(WorkflowStepType) stepType!: WorkflowStepType;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() waitFor?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) waitTimeoutMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() selector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selectorAlt?: string;
  @ApiPropertyOptional({ enum: SelectorType }) @IsOptional() @IsEnum(SelectorType) selectorType?: SelectorType;
  @ApiPropertyOptional({ enum: StepAction }) @IsOptional() @IsEnum(StepAction) action?: StepAction;
  @ApiPropertyOptional() @IsOptional() @IsString() inputValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() inputMapping?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsString() uploadField?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assertText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assertUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assertVisible?: string;
  @ApiPropertyOptional({ enum: StepFailureAction }) @IsOptional() @IsEnum(StepFailureAction) onFailure?: StepFailureAction;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(5) retryCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) delayAfterMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() conditionExpr?: string;
}

export class UpdateWorkflowStepDto extends PartialType(CreateWorkflowStepDto) {}

// ─── Runner Registration ──────────────────────────────────────────────────────

export class RegisterRunnerDto {
  @ApiProperty() @IsString() runnerId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() host!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) capacity?: number;
  @ApiPropertyOptional({ enum: BrowserType }) @IsOptional() @IsEnum(BrowserType) browserType?: BrowserType;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class RunnerHeartbeatDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) activeSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

// ─── Job Dispatch ─────────────────────────────────────────────────────────────

export class DispatchJobDto {
  @ApiProperty() @IsString() templateId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kioskSessionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applicationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() citizenId?: string;
  /** The device serial number — used to push WebSocket progress events back to this kiosk */
  @ApiPropertyOptional() @IsOptional() @IsString() deviceSerial?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() inputData?: Record<string, unknown>;
}

export class CitizenInputDto {
  /** Type of input: OTP_SMS | VNEID_QR_SCANNED | CAPTCHA_SOLVED | CONFIRM | CANCEL */
  @ApiProperty() @IsString() inputType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() value?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class UpdateJobStatusDto {
  @ApiProperty({ enum: JobStatus }) @IsEnum(JobStatus) status!: JobStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() currentStepOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() failReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() outputData?: Record<string, unknown>;
  /** Citizen-friendly message shown on kiosk — never expose technical details */
  @ApiPropertyOptional() @IsOptional() @IsString() citizenMessage?: string;
}

export class InteractEventDto {
  @ApiProperty({ description: 'click | touchStart | touchMove | touchEnd | type | key | scroll | fill | finish' })
  @IsString() type!: 'click' | 'touchStart' | 'touchMove' | 'touchEnd' | 'type' | 'key' | 'scroll' | 'fill' | 'finish';
  @ApiPropertyOptional() @IsOptional() @IsInt() x?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() y?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() text?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() key?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() deltaX?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() deltaY?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() selector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selectorType?: string;
}

export class ReportFocusDto {
  @ApiProperty() @IsBoolean() focused!: boolean;
}

export class LiveFrameDto {
  /** Base64-encoded JPEG bytes of the current page. */
  @ApiProperty() @IsString() b64!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stepName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() stepOrder?: number;
}

export class StartRecordingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiProperty() @IsString() url!: string;
}

export class RecordActionDto {
  @ApiProperty() @IsString() kind!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selectorType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inputType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isInput?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isSelect?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCheckable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() text?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() elId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ariaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() placeholder?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() href?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() value?: string;
}

export class ReplaceStepsDto {
  @ApiProperty({ type: [Object] }) @IsArray() steps!: Array<Record<string, unknown>>;
}

export class RequestInputDto {
  @ApiProperty({ description: 'OTP_SMS | VNEID_QR | CAPTCHA_WAIT | CONFIRM_DATA' })
  @IsString() inputType!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class AddJobLogDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() stepOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() stepName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  @ApiProperty() @IsString() message!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() detail?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsInt() durationMs?: number;
}

export class AddScreenshotDto {
  @ApiProperty() @IsString() storagePath!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bucketName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() stepOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() stepName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sizeBytes?: number;
  /** Live page URL at capture time — forwarded to kiosk address bar (not persisted) */
  @ApiPropertyOptional() @IsOptional() @IsString() pageUrl?: string;
  /** Transient live frame. It is pushed to the kiosk but not stored in screenshot history. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isLive?: boolean;
}
