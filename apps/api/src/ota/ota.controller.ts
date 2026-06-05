import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { OtaService } from "./ota.service";

class OtaPackageDto {
  @IsIn(["kiosk_app", "automation_engine", "workflow", "browser_engine", "config"])
  component!: string;

  @IsString()
  version!: string;

  @IsString()
  packageUrl!: string;

  @IsString()
  sha256!: string;

  @IsString()
  signature!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class OtaDeployDto {
  @IsString()
  packageId!: string;

  @IsArray()
  @IsString({ each: true })
  deviceIds!: string[];
}

@ApiTags("ota")
@Controller("ota")
export class OtaController {
  constructor(private readonly ota: OtaService) {}

  @Get("packages")
  packages() {
    return this.ota.packages();
  }

  @Post("packages")
  createPackage(@Body() dto: OtaPackageDto) {
    return this.ota.createPackage(dto);
  }

  @Post("deployments")
  deploy(@Body() dto: OtaDeployDto) {
    return this.ota.deploy(dto);
  }

  @Get("check/:deviceId")
  check(@Param("deviceId") deviceId: string) {
    return this.ota.checkUpdate(deviceId);
  }
}
