import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { PrismaModule } from './common/prisma.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit/audit.service';
import { AuditInterceptor } from './audit/audit.interceptor';
import { HealthController } from './health.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RedisService } from './redis.service';
import { RealtimeModule } from './realtime/realtime.module';
// Domain modules
import { SessionsModule } from './modules/sessions/sessions.module';
import { CitizensModule } from './modules/citizens/citizens.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { QueueModule } from './modules/queue/queue.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { KioskDevicesModule } from './modules/devices/kiosk-devices.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { HomeServicesModule } from './modules/home-services/home-services.module';
// Enterprise platform modules
import { SeleniumModule } from './modules/selenium/selenium.module';
import { AIWorkerModule } from './modules/ai-worker/ai-worker.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { CopyDocModule } from './modules/copy-doc/copy-doc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env', '.env.local'] }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'hcc-jwt-secret-2026',
      signOptions: { expiresIn: '8h' },
      global: true,
    }),
    PrismaModule,
    RealtimeModule,
    SessionsModule,
    CitizensModule,
    DocumentsModule,
    ProceduresModule,
    ApplicationsModule,
    QueueModule,
    FeedbackModule,
    KioskDevicesModule,
    AdminModule,
    ReportingModule,
    HomeServicesModule,
    SeleniumModule,
    AIWorkerModule,
    WorkflowModule,
    AiGatewayModule,
    CopyDocModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    PrismaService,
    RedisService,
    AuditService,
    AuthService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
