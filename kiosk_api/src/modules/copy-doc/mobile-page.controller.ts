import {
  Controller, Get, Post, Param, Res, Body,
  UseInterceptors, UploadedFile, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MobileScanService } from './mobile-scan.service';
import { CopyDocUploadService } from './copy-doc-upload.service';
import { OcrMatchService } from './ocr-match.service';
import { CopyDocRequestService } from './copy-doc-request.service';
import { ScanSessionStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import * as os from 'os';

const MULTER_OPTS = {
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
};

@ApiTags('mobile / scan page')
@Controller('mobile/scan')
export class MobilePageController {
  constructor(
    private readonly scan: MobileScanService,
    private readonly upload: CopyDocUploadService,
    private readonly ocr: OcrMatchService,
    private readonly requests: CopyDocRequestService,
  ) {}

  /* ─── GET /mobile/scan/:token/qr.png ─────────────────── */
  /** Returns a QR code PNG for the given scan session token */
  @Get(':token/qr.png')
  @ApiOperation({ summary: 'Get QR code PNG for scan session' })
  async getQrPng(@Param('token') token: string, @Res() res: Response) {
    try {
      const session = await this.scan.findByToken(token);
      if (!session.qrPayload) {
        return res.status(404).send('QR not ready');
      }
      const buffer = await QRCode.toBuffer(session.qrPayload, {
        type: 'png',
        width: 280,
        margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(buffer);
    } catch {
      return res.status(404).send('Session not found');
    }
  }

  /* ─── GET /mobile/scan/:token ─────────────────────────── */
  /** Serve the mobile camera page — also marks session as CONNECTED */
  @Get(':token')
  @ApiOperation({ summary: 'Serve mobile document scan page' })
  async getMobilePage(@Param('token') token: string, @Res() res: Response) {
    let session: Awaited<ReturnType<typeof this.scan.findByToken>> | null = null;
    try {
      session = await this.scan.findByToken(token);
    } catch {
      return res.status(404).send(errorHtml('Mã QR không hợp lệ hoặc đã hết hạn.'));
    }

    if (session.status === ScanSessionStatus.EXPIRED || session.expiresAt < new Date()) {
      return res.status(410).send(errorHtml('Mã QR đã hết hạn. Vui lòng quét mã mới tại kiosk.'));
    }
    if (session.status === ScanSessionStatus.COMPLETE) {
      return res.send(successHtml());
    }

    // Mark as CONNECTED + emit WS to kiosk
    try {
      const ua = res.req?.headers?.['user-agent'];
      const ip = (res.req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        ?? res.req?.socket?.remoteAddress
        ?? undefined;
      if (session.status === ScanSessionStatus.PENDING) {
        await this.scan.connectMobile(token, ua, ip);
      }
    } catch {
      // Best-effort — serve page even if WS emission fails
    }

    const apiBase = deriveApiBase(res.req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(mobileScanHtml(token, apiBase));
  }

  /* ─── POST /mobile/scan/:token/upload ─────────────────── */
  /** Receive one or more pages from the mobile browser, classify by the
   *  FIRST page, store every page, and emit the page list to the kiosk. */
  @Post(':token/upload')
  @UseInterceptors(FilesInterceptor('photos', 20, MULTER_OPTS))
  @ApiOperation({ summary: 'Upload one or more scanned document pages from mobile' })
  async uploadPhoto(
    @Param('token') token: string,
    @UploadedFiles() files: Array<{ buffer: Buffer; originalname: string; mimetype: string }> | undefined,
    @Body() body: { ocrText?: string; orientations?: string } | undefined,
    @Res() res: Response,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Không nhận được ảnh. Vui lòng chọn lại.');
    }

    // ocrText is from the FIRST page only (used for classification)
    const ocrText = (body?.ocrText ?? '').toString();
    let orientations: number[] = [];
    try { orientations = JSON.parse(body?.orientations ?? '[]'); } catch { orientations = []; }

    let session: Awaited<ReturnType<typeof this.scan.findByToken>>;
    try {
      session = await this.scan.findByToken(token);
    } catch {
      return res.status(404).json({ success: false, message: 'Phiên QR không hợp lệ.' });
    }

    if (session.status === ScanSessionStatus.EXPIRED || session.expiresAt < new Date()) {
      return res.status(410).json({ success: false, message: 'QR đã hết hạn.' });
    }

    if (session.status === ScanSessionStatus.PENDING) {
      try {
        await this.scan.connectMobile(token);
        session = await this.scan.findByToken(token);
      } catch { /* continue */ }
    }

    try {
      // 1. Classify by the FIRST page only — reject before saving if unknown
      const matchResult = await this.ocr.matchCategory(ocrText);
      if (!matchResult) {
        return res.status(422).json({
          success: false,
          reason: 'no_match',
          message: 'Không nhận diện được loại giấy tờ.',
        });
      }

      // 2. Save every page as a CopyDocPage row
      const pages: { pageIndex: number; url: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f?.buffer) continue;
        const saved = await this.upload.savePageImage(
          session.requestId, i, f.buffer, f.mimetype || 'image/jpeg',
          { ocrText: i === 0 ? ocrText : undefined, ocrOrientation: orientations[i] ?? 0 },
        );
        pages.push({ pageIndex: i, url: saved.url });
      }

      // 3. Record the page paths on the scan session
      await this.scan.uploadImages(token, {
        imagePaths: pages.map(p => p.url.replace('/uploads/', '')),
      });

      // 4. Persist detected category + first-page OCR text
      await this.requests.applyAiResult(session.requestId, {
        categoryId: matchResult.categoryId,
        detectedTypeLabel: matchResult.docTypeLabel,
        detectedTypeConfidence: matchResult.confidence,
        ocrText,
        ocrOrientation: orientations[0] ?? 0,
      });

      const corners = [
        { x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 },
        { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 },
      ];

      // 5. Emit category + full page list to the kiosk
      await this.scan.emitAiResult(session.requestId, {
        corners,
        categoryId: matchResult.categoryId,
        label: matchResult.docTypeLabel,
        confidence: matchResult.confidence,
        price: matchResult.pricePerCopy,
        imageUrl: pages[0]?.url,          // first page (back-compat)
        pages,                            // [{ pageIndex, url }]
      });

      return res.json({
        success: true,
        message: 'Tải lên thành công!',
        label: matchResult.docTypeLabel,
        pageCount: pages.length,
      });
    } catch (err: any) {
      console.error('[MobilePage] Upload error:', err);
      return res.status(500).json({
        success: false,
        message: err?.message ?? 'Lỗi khi xử lý ảnh.',
      });
    }
  }
}

/* ═══════════════════════════════════════════════════════ */
/*  HTML Helpers                                           */
/* ═══════════════════════════════════════════════════════ */

function deriveApiBase(req: any): string {
  if (!req) return getLanBase();
  const forwarded = req.headers?.['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : (forwarded ?? req.protocol ?? 'http');
  const host = req.headers?.['x-forwarded-host'] ?? req.headers?.host ?? '';
  // If host is localhost/127, replace with real LAN IP so phone can reach it
  if (!host || host.startsWith('localhost') || host.startsWith('127.')) {
    return getLanBase(req);
  }
  return `${proto}://${host}`;
}

function getLanBase(req?: any): string {
  const portMatch = (req?.headers?.host ?? 'localhost:3001').match(/:(\d+)/);
  const port = portMatch ? portMatch[1] : (process.env.API_PORT ?? '3001');
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    for (const iface of ifaceList ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${port}`;
      }
    }
  }
  return `http://localhost:${port}`;
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lỗi — Kiosk</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100dvh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #fff; border-radius: 20px; padding: 40px; text-align: center; max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,.1); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; color: #dc2626; margin: 0 0 12px; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Không thể mở trang</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function successHtml(): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Đã tải lên — Kiosk</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f0fdf4; display: flex; align-items: center; justify-content: center; min-height: 100dvh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #fff; border-radius: 20px; padding: 40px; text-align: center; max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,.1); }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 800; color: #16a34a; margin: 0 0 12px; }
    p { font-size: 15px; color: #166534; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Đã tải lên thành công!</h1>
    <p>Quay lại màn hình kiosk để tiếp tục.<br>Bạn có thể đóng trang này.</p>
  </div>
</body>
</html>`;
}

function mobileScanHtml(token: string, apiBase: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Sao Y Tài Liệu — Kiosk</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --blue: #2563eb; --green: #16a34a; --red: #dc2626;
      --bg: #f8fafc; --card: #ffffff;
      --text: #1e293b; --muted: #64748b; --border: #e2e8f0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg); color: var(--text);
      min-height: 100dvh; display: flex; flex-direction: column;
    }
    /* ─── Header ─── */
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: #fff; padding: 18px 20px 14px;
      display: flex; align-items: center; gap: 14px;
    }
    .header-icon { font-size: 30px; }
    .header-text .title { font-size: 19px; font-weight: 700; }
    .header-text .sub { font-size: 13px; opacity: .8; margin-top: 2px; }
    /* ─── Main ─── */
    .main {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; padding: 28px 20px 24px; gap: 18px;
    }
    /* ─── Instruction card ─── */
    .instr-card {
      background: var(--card); border-radius: 18px; padding: 22px 20px;
      width: 100%; max-width: 380px; text-align: center;
      box-shadow: 0 2px 12px rgba(0,0,0,.08);
    }
    .instr-card .big-icon { font-size: 52px; margin-bottom: 12px; }
    .instr-card .card-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .instr-card .card-sub { font-size: 14px; color: var(--muted); line-height: 1.6; }
    /* ─── Preview ─── */
    .preview-wrap {
      display: none; width: 100%; max-width: 380px;
      border-radius: 14px; overflow: hidden; background: var(--border);
    }
    .preview-wrap.show { display: block; }
    .preview-wrap img { width: 100%; display: block; max-height: 280px; object-fit: cover; }
    /* ─── Buttons ─── */
    .btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      border: none; border-radius: 14px; font-size: 16px; font-weight: 700;
      padding: 17px 24px; width: 100%; max-width: 380px; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: transform .12s, opacity .12s;
    }
    .btn:active { transform: scale(.97); opacity: .9; }
    .btn-capture { background: var(--blue); color: #fff; }
    .btn-upload { background: var(--green); color: #fff; display: none; }
    .btn-upload.show { display: flex; }
    .btn-retake { background: #f1f5f9; color: #475569; display: none; font-size: 14px; padding: 12px 20px; }
    .btn-retake.show { display: flex; }
    /* ─── Error ─── */
    .err {
      display: none; background: #fef2f2; color: var(--red);
      border: 1.5px solid #fecaca; border-radius: 12px;
      padding: 12px 16px; font-size: 14px; font-weight: 600;
      width: 100%; max-width: 380px; text-align: center;
    }
    .err.show { display: block; }
    /* ─── Progress overlay ─── */
    .overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,.55); backdrop-filter: blur(6px);
      align-items: center; justify-content: center; z-index: 50;
    }
    .overlay.show { display: flex; }
    .overlay-card {
      background: var(--card); border-radius: 22px; padding: 36px 40px;
      text-align: center; max-width: 280px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,.2);
    }
    .spinner {
      width: 52px; height: 52px; border-radius: 50%;
      border: 4px solid var(--border); border-top-color: var(--blue);
      animation: spin .75s linear infinite; margin: 0 auto 18px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .overlay-title { font-size: 17px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
    .overlay-sub { font-size: 13px; color: var(--muted); }
    /* ─── Success full-screen ─── */
    .success-screen {
      display: none; position: fixed; inset: 0;
      background: linear-gradient(160deg, #f0fdf4 0%, #dcfce7 100%);
      flex-direction: column; align-items: center; justify-content: center;
      gap: 18px; text-align: center; padding: 32px; z-index: 100;
    }
    .success-screen.show { display: flex; }
    .success-big { font-size: 80px; animation: pop .45s cubic-bezier(.34,1.56,.64,1) both; }
    @keyframes pop { from { transform: scale(0) rotate(-20deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
    .success-title { font-size: 26px; font-weight: 900; color: #15803d; }
    .success-sub { font-size: 15px; color: #166534; line-height: 1.6; }
    .success-badge {
      background: #15803d; color: #bbf7d0; border-radius: 12px;
      padding: 10px 22px; font-size: 14px; font-weight: 600;
    }
    /* ─── Footer ─── */
    .footer { padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; }
    /* ─── Hidden inputs ─── */
    #camInput, #galInput { display: none; }
    /* ─── Pages grid ─── */
    .pages-wrap { width: 100%; max-width: 380px; display: none; }
    .pages-wrap.show { display: block; }
    .pages-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .pages-head .t { font-size: 14px; font-weight: 800; color: var(--text); }
    .pages-head .c { font-size: 13px; color: var(--muted); font-weight: 600; }
    .pages-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .page-thumb {
      position: relative; aspect-ratio: 3/4; border-radius: 12px; overflow: hidden;
      background: var(--border); border: 2px solid var(--border);
    }
    .page-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .page-thumb .idx {
      position: absolute; left: 6px; top: 6px; min-width: 22px; height: 22px;
      padding: 0 6px; border-radius: 99px; background: rgba(37,99,235,.92); color: #fff;
      font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center;
    }
    .page-thumb .first-badge {
      position: absolute; left: 0; right: 0; bottom: 0; background: rgba(22,163,74,.92);
      color: #fff; font-size: 10px; font-weight: 700; text-align: center; padding: 3px 0;
    }
    .page-thumb .rm {
      position: absolute; right: 5px; top: 5px; width: 24px; height: 24px; border-radius: 99px;
      background: rgba(220,38,38,.95); color: #fff; border: none; font-size: 16px; line-height: 1;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    /* ─── Add buttons row ─── */
    .add-row { display: flex; gap: 10px; width: 100%; max-width: 380px; }
    .btn-add {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
      border: 2px dashed var(--blue); border-radius: 14px; background: #eff6ff; color: var(--blue);
      font-size: 14px; font-weight: 700; padding: 14px 10px; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .btn-add:active { transform: scale(.97); }
    /* ─── OCR progress bar ─── */
    .ocr-prog { width: 100%; max-width: 380px; display: none; }
    .ocr-prog.show { display: block; }
    .ocr-prog .bar-bg { height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; }
    .ocr-prog .bar-fg { height: 100%; width: 0%; background: var(--blue); border-radius: 99px; transition: width .3s ease; }
    .ocr-prog .lbl { font-size: 13px; color: var(--muted); margin-top: 8px; text-align: center; font-weight: 600; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
</head>
<body>

<header class="header">
  <span class="header-icon">📄</span>
  <div class="header-text">
    <div class="title">Sao Y Tài Liệu</div>
    <div class="sub">Kiosk Dịch Vụ Công — Không cần cài app</div>
  </div>
</header>

<main class="main">
  <!-- Instructions (shown when no page added yet) -->
  <div class="instr-card" id="instrCard">
    <div class="big-icon">📄</div>
    <div class="card-title">Chụp hoặc chọn tài liệu</div>
    <div class="card-sub">
      Có thể thêm <b>nhiều trang</b>. Loại giấy tờ được xác định theo <b>trang đầu tiên</b>.<br>
      Đặt phẳng, đủ ánh sáng, thấy rõ 4 góc.
    </div>
  </div>

  <!-- Pages grid -->
  <div class="pages-wrap" id="pagesWrap">
    <div class="pages-head">
      <span class="t">Các trang tài liệu</span>
      <span class="c" id="pagesCount">0 trang</span>
    </div>
    <div class="pages-grid" id="pagesGrid"></div>
  </div>

  <!-- Error message -->
  <div class="err" id="errMsg"></div>

  <!-- OCR progress -->
  <div class="ocr-prog" id="ocrProg">
    <div class="bar-bg"><div class="bar-fg" id="ocrBar"></div></div>
    <div class="lbl" id="ocrLbl">Đang nhận diện tài liệu…</div>
  </div>

  <!-- Hidden inputs: camera (single) + gallery (multiple) -->
  <input type="file" id="camInput" accept="image/*" capture="environment" />
  <input type="file" id="galInput" accept="image/*" multiple />

  <!-- Add buttons -->
  <div class="add-row">
    <button class="btn-add" id="btnCam" onclick="openCamera()">
      <span>📷</span> Chụp trang
    </button>
    <button class="btn-add" id="btnGal" onclick="openGallery()">
      <span>🖼️</span> Chọn ảnh
    </button>
  </div>

  <!-- Send button -->
  <button class="btn btn-upload" id="btnUpload" onclick="uploadPages()">
    <span>✅</span> Gửi <span id="sendCount">0</span> trang lên Kiosk
  </button>
</main>

<!-- Loading overlay -->
<div class="overlay" id="loadOverlay">
  <div class="overlay-card">
    <div class="spinner"></div>
    <div class="overlay-title">Đang tải lên...</div>
    <div class="overlay-sub">Vui lòng không đóng trang này</div>
  </div>
</div>

<!-- Success full-screen -->
<div class="success-screen" id="successScreen">
  <span class="success-big">✅</span>
  <div class="success-title">Tải lên thành công!</div>
  <div class="success-sub">
    Tài liệu đã được gửi tới kiosk.<br>
    Quay lại màn hình kiosk để tiếp tục.
  </div>
  <div class="success-badge">Bạn có thể đóng trang này</div>
</div>

<footer class="footer">Hệ thống Kiosk Dịch Vụ Công · Bảo mật &amp; An toàn</footer>

<script>
  var TOKEN    = "${token}";
  var API_BASE = "${apiBase}";
  var pages           = [];     // [{ blob, url, ocrText, orientation }] — ordered pages
  var busy            = false;  // true while processing added files
  var ocrWorker       = null;   // cached Tesseract worker
  var ocrPhase        = 'load'; // 'load' | 'sweep' | 'final' — controls progress bar

  function $id(id) { return document.getElementById(id); }
  function cls(el, add, rm) {
    if (add) el.classList.add(add);
    if (rm)  el.classList.remove(rm);
  }

  /* ── OCR progress UI ─────────────────────────────────── */
  function setOcr(pct, label) {
    cls($id('ocrProg'), 'show', null);
    $id('ocrBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (label) $id('ocrLbl').textContent = label;
  }
  function hideOcr() { cls($id('ocrProg'), null, 'show'); }

  /* ── Lazy-init Tesseract worker (Vietnamese, LSTM) ───── */
  async function getWorker() {
    if (ocrWorker) return ocrWorker;
    if (typeof Tesseract === 'undefined') {
      throw new Error('TESSERACT_NOT_LOADED');
    }
    setOcr(4, 'Đang tải bộ nhận diện (lần đầu)…');
    ocrWorker = await Tesseract.createWorker('vie', 1, {
      logger: function(m) {
        if (m.status === 'recognizing text') {
          // Only drive the bar during the final high-res read; the 4-angle
          // sweep is driven manually so it doesn't flicker back and forth.
          if (ocrPhase === 'final') {
            setOcr(70 + Math.round((m.progress || 0) * 28), 'Đang đọc nội dung…');
          }
        } else if (typeof m.progress === 'number') {
          setOcr(4 + Math.round(m.progress * 14), 'Đang tải bộ nhận diện…');
        }
      },
    });
    return ocrWorker;
  }

  /* ── Draw bitmap rotated by deg (0/90/180/270), capped to maxSize ── */
  function rotateToCanvas(bitmap, deg, maxSize) {
    var W = bitmap.width, H = bitmap.height;
    var scale = maxSize ? Math.min(1, maxSize / Math.max(W, H)) : 1;
    var sw = Math.round(W * scale), sh = Math.round(H * scale);
    var swap = (deg === 90 || deg === 270);
    var canvas = document.createElement('canvas');
    canvas.width  = swap ? sh : sw;
    canvas.height = swap ? sw : sh;
    var ctx = canvas.getContext('2d');
    ctx.save();
    if (deg === 90)       { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
    else if (deg === 180) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
    else if (deg === 270) { ctx.translate(0, canvas.height); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(bitmap, 0, 0, sw, sh);
    ctx.restore();
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function(res) {
      canvas.toBlob(function(b) { res(b); }, 'image/jpeg', 0.9);
    });
  }

  /* ── Run OCR on a canvas, return score + text ───────────
     Tesseract.js v5 dropped data.words, so we derive a word
     count from data.text (works regardless of output shape). */
  async function ocrScore(canvas) {
    var w = await getWorker();
    var r = await w.recognize(canvas);
    var text = (r.data.text || '').trim();
    var conf = r.data.confidence || 0;
    // Count alphanumeric runs as "words" — regex has no backslash so it
    // survives the surrounding HTML template literal intact.
    var tokens = (text.match(/[a-z0-9]+/gi) || []).filter(function(t) {
      return t.length >= 2;
    });
    return { conf: conf, words: tokens.length, text: text };
  }

  /* ── Full pipeline: detect upright orientation + extract text ──
     createImageBitmap does NOT apply EXIF, so sweeping all 4 raw
     rotations naturally corrects both EXIF and sideways text.    */
  async function processImage(file) {
    await getWorker();
    var bitmap = await createImageBitmap(file);

    // 1. Orientation sweep on fast thumbnails. Score = confidence × words
    //    so the upright orientation (most readable words) wins.
    ocrPhase = 'sweep';
    setOcr(22, 'Đang xác định hướng tài liệu…');
    var angles = [0, 90, 180, 270];
    var best = { deg: 0, score: -1, text: '' };
    for (var i = 0; i < angles.length; i++) {
      var thumb = rotateToCanvas(bitmap, angles[i], 1000);
      var s = await ocrScore(thumb);
      var score = s.conf * s.words;
      if (score > best.score) best = { deg: angles[i], score: score, text: s.text };
      setOcr(22 + (i + 1) * 11, 'Đang xác định hướng… (' + (i + 1) + '/4)');
      // short-circuit: upright already gives a strong reading
      if (angles[i] === 0 && s.conf > 75 && s.words >= 10) break;
    }

    // 2. Rotate full-res to the winning orientation
    ocrPhase = 'final';
    setOcr(70, 'Đang đọc nội dung…');
    var finalCanvas = rotateToCanvas(bitmap, best.deg, 1800);

    // 3. Final OCR at higher resolution for accurate keyword text
    var finalScore = await ocrScore(finalCanvas);
    var ocrText = (finalScore.text && finalScore.text.length >= (best.text || '').length)
      ? finalScore.text : best.text;

    var blob = await canvasToBlob(finalCanvas);
    if (bitmap.close) bitmap.close();
    setOcr(100, 'Hoàn tất');
    return { blob: blob, ocrText: ocrText, orientation: best.deg };
  }

  function openCamera()  { if (!busy) $id('camInput').click(); }
  function openGallery() { if (!busy) $id('galInput').click(); }

  /* ── Render the page thumbnail grid ──────────────────── */
  function renderPages() {
    var grid = $id('pagesGrid');
    grid.innerHTML = '';
    for (var i = 0; i < pages.length; i++) {
      (function(idx) {
        var cell = document.createElement('div');
        cell.className = 'page-thumb';
        var img = document.createElement('img');
        img.src = pages[idx].url;
        cell.appendChild(img);
        var badge = document.createElement('div');
        badge.className = 'idx';
        badge.textContent = (idx + 1);
        cell.appendChild(badge);
        var rm = document.createElement('button');
        rm.className = 'rm';
        rm.innerHTML = '×';
        rm.onclick = function() { removePage(idx); };
        cell.appendChild(rm);
        if (idx === 0) {
          var fb = document.createElement('div');
          fb.className = 'first-badge';
          fb.textContent = 'Trang xác định loại';
          cell.appendChild(fb);
        }
        grid.appendChild(cell);
      })(i);
    }
    var n = pages.length;
    cls($id('pagesWrap'), n > 0 ? 'show' : null, n > 0 ? null : 'show');
    $id('instrCard').style.display = n > 0 ? 'none' : '';
    cls($id('btnUpload'), n > 0 ? 'show' : null, n > 0 ? null : 'show');
    $id('pagesCount').textContent = n + ' trang';
    $id('sendCount').textContent = n;
  }

  function removePage(idx) {
    if (busy) return;
    try { URL.revokeObjectURL(pages[idx].url); } catch(_) {}
    pages.splice(idx, 1);
    renderPages();
  }

  /* ── Add one or more files (camera or gallery) ───────── */
  async function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length || busy) return;
    busy = true;
    cls($id('errMsg'), null, 'show');
    $id('btnCam').style.opacity = '.5';
    $id('btnGal').style.opacity = '.5';

    var weakCount = 0;
    for (var i = 0; i < files.length; i++) {
      setOcr(4, 'Đang xử lý trang ' + (pages.length + 1) + '…');
      try {
        var result = await processImage(files[i]);
        var blob = result.blob;
        var page = {
          blob: blob,
          url: URL.createObjectURL(blob),
          ocrText: result.ocrText || '',
          orientation: result.orientation || 0,
        };
        pages.push(page);
        try { console.log('[OCR] page=' + pages.length + ' orient=' + page.orientation + ' textLen=' + page.ocrText.length + ' :: ' + page.ocrText); } catch(_) {}
        if ((page.ocrText.match(/[a-z0-9]/gi) || []).length < 8) weakCount++;
        renderPages();
      } catch (err) {
        if (err && err.message === 'TESSERACT_NOT_LOADED') {
          var eT = $id('errMsg');
          eT.textContent = 'Không tải được bộ nhận diện chữ (cần Internet lần đầu). Kiểm tra kết nối và thử lại.';
          cls(eT, 'show', null);
          break;
        }
        // Fallback: keep raw file as a page (server still validates)
        var page2 = { blob: files[i], url: URL.createObjectURL(files[i]), ocrText: '', orientation: 0 };
        pages.push(page2);
        renderPages();
      }
    }

    hideOcr();
    busy = false;
    $id('btnCam').style.opacity = '';
    $id('btnGal').style.opacity = '';
    $id('camInput').value = '';
    $id('galInput').value = '';

    if (weakCount > 0) {
      var w1 = $id('errMsg');
      w1.textContent = 'Có ' + weakCount + ' trang ảnh chưa rõ chữ. Trang đầu tiên cần rõ để nhận diện loại giấy tờ.';
      cls(w1, 'show', null);
    }
  }

  $id('camInput').addEventListener('change', function(e) { addFiles(e.target.files); });
  $id('galInput').addEventListener('change', function(e) { addFiles(e.target.files); });

  /* ── Send all pages — classification uses page 1 ─────── */
  async function uploadPages() {
    if (busy || pages.length === 0) return;
    cls($id('loadOverlay'), 'show', null);
    cls($id('errMsg'), null, 'show');

    try {
      var fd = new FormData();
      var orientations = [];
      for (var i = 0; i < pages.length; i++) {
        fd.append('photos', pages[i].blob, 'page_' + (i + 1) + '.jpg');
        orientations.push(pages[i].orientation || 0);
      }
      fd.append('ocrText', pages[0].ocrText || '');     // FIRST page determines type
      fd.append('orientations', JSON.stringify(orientations));

      var resp = await fetch(API_BASE + '/mobile/scan/' + TOKEN + '/upload', {
        method: 'POST', body: fd,
      });
      var data = await resp.json().catch(function() { return {}; });
      cls($id('loadOverlay'), null, 'show');

      if (!resp.ok || !data.success) {
        if (data.reason === 'no_match') {
          var e1 = $id('errMsg');
          e1.textContent = 'Không nhận diện được loại giấy tờ từ TRANG ĐẦU. Vui lòng đặt trang chính (có tiêu đề) làm trang 1, chụp rõ nét rồi gửi lại.';
          cls(e1, 'show', null);
          return;
        }
        throw new Error(data.message || 'Lỗi tải lên. Vui lòng thử lại.');
      }

      cls($id('successScreen'), 'show', null);
    } catch (err) {
      cls($id('loadOverlay'), null, 'show');
      var errEl = $id('errMsg');
      errEl.textContent = 'Lỗi: ' + (err.message || 'Không thể tải lên.');
      cls(errEl, 'show', null);
    }
  }
</script>
</body>
</html>`;
}
