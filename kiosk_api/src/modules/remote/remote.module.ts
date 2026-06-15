import { Module } from '@nestjs/common';
import { KioskDevicesModule } from '../devices/kiosk-devices.module';
import { RemoteController } from './remote.controller';
import { RemoteService } from './remote.service';

@Module({
  imports: [KioskDevicesModule],
  controllers: [RemoteController],
  providers: [RemoteService],
})
export class RemoteModule {}
