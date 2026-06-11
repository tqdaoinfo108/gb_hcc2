import * as crypto from 'crypto';

/**
 * AES-256-GCM secret encryption for at-rest storage of provider auth keys.
 * Key derived from APP_ENCRYPTION_KEY (falls back to JWT secret in dev).
 * Format: base64(iv).base64(authTag).base64(ciphertext)
 */
const RAW_KEY =
  process.env.APP_ENCRYPTION_KEY ??
  process.env.JWT_SECRET ??
  'hcc-default-dev-encryption-key-change-me';

const KEY = crypto.createHash('sha256').update(RAW_KEY).digest(); // 32 bytes

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

/** Mask a secret for display in CMS (never return plaintext). */
export function maskSecret(payload: string | null | undefined): string | null {
  return payload ? '••••••••' : null;
}
