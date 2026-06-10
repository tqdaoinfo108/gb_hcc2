import { Module } from '@nestjs/common';
import { AIWorkerService } from './ai-worker.service';
import { AIJobService } from './ai-job.service';
import { AIWorkerController, AIJobController } from './ai-worker.controller';

@Module({
  controllers: [AIWorkerController, AIJobController],
  providers: [AIWorkerService, AIJobService],
  exports: [AIWorkerService, AIJobService],
})
export class AIWorkerModule {}
