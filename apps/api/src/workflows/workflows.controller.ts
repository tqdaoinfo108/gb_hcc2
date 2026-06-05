import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";
import { WorkflowsService } from "./workflows.service";

class WorkflowDto {
  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class WorkflowVersionDto {
  @IsString()
  version!: string;

  @IsObject()
  definition!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  signature?: string;
}

@ApiTags("workflows")
@Controller("workflows")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list() {
    return this.workflows.list();
  }

  @Post()
  upsert(@Body() dto: WorkflowDto) {
    return this.workflows.upsertWorkflow(dto);
  }

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.workflows.get(slug);
  }

  @Get(":slug/active")
  active(@Param("slug") slug: string) {
    return this.workflows.active(slug);
  }

  @Post(":slug/versions")
  createVersion(@Param("slug") slug: string, @Body() dto: WorkflowVersionDto) {
    return this.workflows.createVersion(slug, dto);
  }
}
