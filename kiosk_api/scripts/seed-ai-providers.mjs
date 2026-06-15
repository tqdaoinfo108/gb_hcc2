// Seed the citizen-chatbot AI providers (NVIDIA + OpenRouter) into ai_runners.
// Keys are read from the repo-root .env, encrypted (AES-256-GCM, matching
// src/common/crypto.util.ts), and stored at rest. Idempotent: upserts by name.
//
//   node scripts/seed-ai-providers.mjs       (run from kiosk_api/)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));

// Load repo-root .env into process.env (without overriding already-set vars).
const envPath = resolve(here, '../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Mirror crypto.util.ts key derivation + format: base64(iv).base64(tag).base64(ct)
const RAW_KEY =
  process.env.APP_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'hcc-default-dev-encryption-key-change-me';
const KEY = crypto.createHash('sha256').update(RAW_KEY).digest();
function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

const CAPS = ['QA_RESPONSE', 'INTENT_DETECTION', 'PROCEDURE_MATCH'];

const PROVIDERS = [
  {
    name: 'NVIDIA Llama-4 Maverick',
    provider: 'OPENAI_COMPAT',
    endpoint: 'https://integrate.api.nvidia.com',
    modelName: 'meta/llama-4-maverick-17b-128e-instruct',
    keyEnv: 'NVIDIA_API_KEY',
    priority: 1,
  },
  {
    name: 'OpenRouter GPT-4o',
    provider: 'OPENAI_COMPAT',
    endpoint: 'https://openrouter.ai/api',
    modelName: 'openai/gpt-4o',
    keyEnv: 'OPENROUTER_API_KEY',
    priority: 2,
  },
];

const prisma = new PrismaClient();

async function main() {
  for (const p of PROVIDERS) {
    const rawKey = process.env[p.keyEnv];
    if (!rawKey) {
      console.warn(`⚠ Skipping "${p.name}" — ${p.keyEnv} not set in .env`);
      continue;
    }
    const authKey = encryptSecret(rawKey);
    const existing = await prisma.aiRunner.findFirst({ where: { name: p.name, deletedAt: null } });
    if (existing) {
      await prisma.aiRunner.update({
        where: { id: existing.id },
        data: {
          provider: p.provider, endpoint: p.endpoint, modelName: p.modelName,
          authKey, priority: p.priority, capabilities: CAPS, status: 'ENABLED',
        },
      });
      console.log(`✓ Updated provider "${p.name}" (${p.modelName})`);
    } else {
      await prisma.aiRunner.create({
        data: {
          name: p.name, provider: p.provider, endpoint: p.endpoint, modelName: p.modelName,
          authKey, priority: p.priority, timeoutMs: 30000, maxConcurrent: 4,
          capabilities: CAPS, status: 'ENABLED',
        },
      });
      console.log(`✓ Created provider "${p.name}" (${p.modelName})`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
