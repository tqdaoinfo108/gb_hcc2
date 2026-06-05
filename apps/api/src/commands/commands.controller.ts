import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString } from "class-validator";
import type { RemoteCommand } from "@smart-kiosk/shared-types";
import { CommandsService } from "./commands.service";

class IssueCommandDto {
  @IsString()
  deviceId!: string;

  @IsIn(["restart_app", "restart_device", "lock", "unlock", "clear_cache", "capture_screen", "push_workflow", "update_config"])
  command!: RemoteCommand;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

@ApiTags("commands")
@Controller("commands")
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Post()
  issue(@Body() dto: IssueCommandDto) {
    return this.commands.issue(dto);
  }
}
