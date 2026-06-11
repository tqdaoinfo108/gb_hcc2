import { Module } from '@nestjs/common';
import { SeleniumModule } from '../selenium/selenium.module';
import { WorkflowLaunchService } from './workflow-launch.service';
import { WorkflowLaunchController } from './workflow-launch.controller';

@Module({
  imports: [SeleniumModule], // reuse the shared Selenium execution pipeline
  controllers: [WorkflowLaunchController],
  providers: [WorkflowLaunchService],
  exports: [WorkflowLaunchService],
})
export class WorkflowModule {}
