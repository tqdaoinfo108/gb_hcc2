import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client?: RedisClientType;

  async getClient() {
    if (!this.client) {
      this.client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
      this.client.on("error", (error) => {
        console.error("Redis error", error.message);
      });
      await this.client.connect();
    }
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
