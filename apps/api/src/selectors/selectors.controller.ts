import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { SelectorsService } from "./selectors.service";

class SelectorDto {
  @IsString()
  selectorKey!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  workflowId?: string;
}

class SelectorVersionDto {
  @IsString()
  version!: string;

  @IsIn(["data-testid", "aria-label", "text", "css", "xpath", "image"])
  selectorType!: string;

  @IsString()
  selectorValue!: string;

  @IsInt()
  @Min(1)
  priority!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags("selectors")
@Controller("selectors")
export class SelectorsController {
  constructor(private readonly selectors: SelectorsService) {}

  @Get()
  list() {
    return this.selectors.list();
  }

  @Post()
  upsert(@Body() dto: SelectorDto) {
    return this.selectors.upsert(dto);
  }

  @Post(":selectorKey/versions")
  addVersion(@Param("selectorKey") selectorKey: string, @Body() dto: SelectorVersionDto) {
    return this.selectors.addVersion(selectorKey, dto);
  }
}
