import { Module } from '@nestjs/common';
import { AiGatewayController, AiRunnerController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';
import { AiRunnerService } from './ai-runner.service';
import { AiHealthService } from './ai-health.service';
import { ChatbotConfigService } from './chatbot-config.service';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [WorkflowModule], // AI flow converges into the shared launch pipeline
  controllers: [AiGatewayController, AiRunnerController],
  providers: [AiGatewayService, AiRunnerService, AiHealthService, ChatbotConfigService],
  exports: [AiGatewayService, AiRunnerService, ChatbotConfigService],
})
export class AiGatewayModule {}
