import "./load-env";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as path from "path";
import * as express from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Live JPEG frames arrive as base64 JSON — raise the body limit well above the
  // 100kb express default so 2× screenshots (~0.5–1MB base64) aren't rejected.
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ limit: '8mb', extended: true }));
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Smart Government Kiosk Platform API")
    .setDescription("REST API and Socket.IO gateway for kiosk fleet operations")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.API_PORT ?? 3001);
  // Bind on all interfaces so phones on the same LAN can reach the server
  await app.listen(port, '0.0.0.0');
  const os = await import('os');
  const nets = os.networkInterfaces();
  const lanIps: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) lanIps.push(iface.address);
    }
  }
  console.log(`Smart Kiosk API listening on port ${port}`);
  console.log(`  → Local:   http://localhost:${port}`);
  for (const ip of lanIps) {
    console.log(`  → Network: http://${ip}:${port}  (phones on same WiFi use this)`);
  }
}

void bootstrap();
