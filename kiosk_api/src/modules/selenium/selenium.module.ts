import { Module } from '@nestjs/common';
import { WorkflowTemplateService } from './workflow-template.service';
import { SeleniumRunnerService } from './selenium-runner.service';
import { SeleniumJobService } from './selenium-job.service';
import {
  WorkflowTemplateController,
  SeleniumRunnerController,
  SeleniumJobController,
} from './selenium.controller';
import { SeleniumUploadController } from './selenium-upload.controller';

@Module({
  controllers: [
    WorkflowTemplateController,
    SeleniumRunnerController,
    SeleniumJobController,
    SeleniumUploadController,
  ],
  providers: [
    WorkflowTemplateService,
    SeleniumRunnerService,
    SeleniumJobService,
  ],
  exports: [
    WorkflowTemplateService,
    SeleniumRunnerService,
    SeleniumJobService,
  ],
})
export class SeleniumModule {}
