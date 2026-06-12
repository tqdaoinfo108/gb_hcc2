import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

/** High-frequency / machine traffic that must NOT be audited. */
const SKIP = [
  /\/selenium\/jobs\/[^/]+\/(frame|interactions|screenshots|report-focus|interact|record-action|status|logs|request-input|citizen-input|poll-input)/,
  /\/selenium\/runners\/[^/]+\/heartbeat/,
  /\/selenium\/runners\/register/,
  /\/auth\/login/,
  /\/kiosk\/home-services\?/, // GETs excluded already; guard anyway
];

/** Map a request path to a coarse module key (matches CMS nav modules). */
function moduleOf(path: string): string {
  const p = path.replace(/^\/+/, '').split('?')[0];
  const seg = p.split('/');
  if (seg[0] === 'admin' && seg[1] === 'users') return 'users';
  if (seg[0] === 'admin') return 'users';
  if (seg[0] === 'kiosk' && seg[1] === 'home-services') return 'home_services';
  if (seg[0] === 'kiosk-devices' || seg[0] === 'devices') return 'devices';
  if (seg[0] === 'copy-doc') return 'copydoc';
  if (seg[0] === 'queue') return 'queue';
  if (seg[0] === 'procedures') return 'procedures';
  if (seg[0] === 'selenium' || seg[0] === 'workflows') return 'workflows';
  if (seg[0] === 'feedback') return 'feedback';
  if (seg[0] === 'applications') return 'applications';
  if (seg[0] === 'citizens') return 'citizens';
  return seg[0] || 'system';
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const action = ACTION_BY_METHOD[method];
    const url: string = req.originalUrl || req.url || '';

    // Only mutations, and skip machine/high-frequency traffic.
    if (!action || SKIP.some((re) => re.test(url))) {
      return next.handle();
    }

    const headers = req.headers || {};
    const actorId = (headers['x-actor-id'] as string) || null;
    const actorNameRaw = (headers['x-actor-name'] as string) || null;
    const actorName = actorNameRaw ? safeDecode(actorNameRaw) : null;
    const locationId = (headers['x-location-id'] as string) || null;
    const ip = (headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress;
    const userAgent = headers['user-agent'] as string | undefined;
    const targetId = req.params?.id || req.params?.serviceId || req.params?.runnerId || undefined;
    const bodySnapshot = compact(req.body);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const res = ctx.switchToHttp().getResponse();
          this.audit
            .record({
              adminId: actorId,
              actorName,
              locationId,
              action,
              module: moduleOf(url),
              method,
              path: url.split('?')[0].slice(0, 200),
              statusCode: res?.statusCode,
              targetId: targetId || (data && typeof data === 'object' ? (data as { id?: string }).id : undefined),
              after: bodySnapshot,
              ipAddress: ip,
              userAgent,
            })
            .catch(() => undefined); // never break the request on audit failure
        },
        error: () => undefined, // failed requests aren't audited as success
      }),
    );
  }
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Strip large/sensitive fields and cap size for the audit snapshot. */
function compact(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (/password|token|b64|data|secret/i.test(k)) { out[k] = '«hidden»'; continue; }
    if (typeof v === 'string' && v.length > 200) { out[k] = v.slice(0, 200) + '…'; continue; }
    out[k] = v;
  }
  return out;
}
