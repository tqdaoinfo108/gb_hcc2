import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service";
import { AuditService } from "./audit/audit.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { DevicesController } from "./devices/devices.controller";
import { DevicesService } from "./devices/devices.service";
import { CommandsController } from "./commands/commands.controller";
import { CommandsService } from "./commands/commands.service";
import { WorkflowsController } from "./workflows/workflows.controller";
import { WorkflowsService } from "./workflows/workflows.service";
import { SelectorsController } from "./selectors/selectors.controller";
import { SelectorsService } from "./selectors/selectors.service";
import { OtaController } from "./ota/ota.controller";
import { OtaService } from "./ota/ota.service";
import { AutomationController } from "./automation/automation.controller";
import { AiController } from "./ai/ai.controller";
import { AiService } from "./ai/ai.service";
import { HealthController } from "./health.controller";
import { RealtimeService } from "./realtime/realtime.service";
import { DeviceGateway } from "./realtime/device.gateway";
import { CmsGateway } from "./realtime/cms.gateway";
import { KioskGateway } from "./realtime/kiosk.gateway";
import { RedisService } from "./redis.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env", ".env.local"] }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "change-this-in-production",
      signOptions: { expiresIn: "8h" }
    })
  ],
  controllers: [
    HealthController,
    AuthController,
    DevicesController,
    CommandsController,
    WorkflowsController,
    SelectorsController,
    OtaController,
    AutomationController,
    AiController
  ],
  providers: [
    PrismaService,
    RedisService,
    AuditService,
    AuthService,
    DevicesService,
    CommandsService,
    WorkflowsService,
    SelectorsService,
    OtaService,
    AiService,
    RealtimeService,
    DeviceGateway,
    CmsGateway,
    KioskGateway
  ]
})
export class AppModule {}
