import { Module } from '@nestjs/common';
import { HomeServicesController } from './home-services.controller';
import { HomeServicesService } from './home-services.service';

@Module({
  controllers: [HomeServicesController],
  providers:   [HomeServicesService],
  exports:     [HomeServicesService],
})
export class HomeServicesModule {}
