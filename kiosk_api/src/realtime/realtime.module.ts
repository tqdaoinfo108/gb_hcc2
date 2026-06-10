import { Global, Module } from '@nestjs/common';
import { CmsGateway } from './cms.gateway';
import { DeviceGateway } from './device.gateway';
import { KioskGateway } from './kiosk.gateway';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  providers: [RealtimeService, DeviceGateway, CmsGateway, KioskGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
