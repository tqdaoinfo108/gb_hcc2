import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DevicesService } from "./devices.service";

@ApiTags("devices")
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list() {
    return this.devices.list();
  }

  @Get("dashboard")
  dashboard() {
    return this.devices.dashboard();
  }

  @Get(":deviceId")
  get(@Param("deviceId") deviceId: string) {
    return this.devices.get(deviceId);
  }
}
