import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { CommandsService } from './commands.service';

class IssueCommandDto {
  @IsString()
  deviceId!: string;

  @IsString()
  command!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

@ApiTags('commands')
@Controller('commands')
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Post()
  issue(@Body() dto: IssueCommandDto) {
    return this.commands.issue(dto);
  }
}
