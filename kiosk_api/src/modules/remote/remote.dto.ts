import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Commands the CMS may dispatch to a kiosk. Web-safe ones run in the renderer;
 *  native ones (REBOOT/SHUTDOWN) require the Tauri shell and degrade gracefully. */
export const REMOTE_COMMANDS = [
  'RELOAD',          // reload the kiosk web app
  'GOTO_IDLE',       // end current session, return to idle screen + wipe
  'PING',            // liveness check, device acks immediately
  'COLLECT_LOGS',    // device returns its recent log buffer
  'SCREENSHOT',      // device returns a screenshot (data URL)
  'DIAGNOSTICS',     // device returns a self-check report
  'MAINTENANCE_ON',  // disable kiosk (maintenance mode)
  'MAINTENANCE_OFF', // re-enable kiosk
  'REBOOT',          // native: restart the device OS
  'SHUTDOWN',        // native: power off the device
] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

export class IssueCommandDto {
  @IsString()
  @IsIn(REMOTE_COMMANDS as unknown as string[])
  command!: RemoteCommand;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class AckCommandDto {
  @IsString()
  actionId!: string;

  @IsString()
  @IsIn(['SUCCESS', 'FAILED', 'UNSUPPORTED'])
  status!: 'SUCCESS' | 'FAILED' | 'UNSUPPORTED';

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  result?: string;

  /** Optional artifact: screenshot data URL or collected logs text. */
  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  artifact?: string;
}
