import { Module } from '@nestjs/common';
import { OtaController } from './ota.controller';
import { OtaService } from './ota.service';

@Module({
  controllers: [OtaController],
  providers: [OtaService],
})
export class OtaModule {}
