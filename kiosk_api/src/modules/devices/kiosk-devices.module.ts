import { Module } from '@nestjs/common';
import { KioskDevicesController } from './kiosk-devices.controller';
import { KioskDevicesService } from './kiosk-devices.service';

@Module({
  controllers: [KioskDevicesController],
  providers: [KioskDevicesService],
  exports: [KioskDevicesService],
})
export class KioskDevicesModule {}
