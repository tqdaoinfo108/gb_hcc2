import {
  Controller, Get, Post, Param, Body, Res,
  UseInterceptors, UploadedFile, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as QRCode from 'qrcode';
import * as os from 'os';
import { SeleniumJobService } from './selenium-job.service';

/** Replace localhost/127.0.0.1 with the first external IPv4 so phones on the
 *  same Wi-Fi can reach the QR upload page. */
function resolvePublicBaseUrl(rawBase: string): string {
  if (!rawBase.includes('localhost') && !rawBase.includes('127.0.0.1')) return rawBase;
  const portMatch = rawBase.match(/:(\d+)\/?$/);
  const port = portMatch ? portMatch[1] : '4000';
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    for (const iface of ifaceList ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return `http://${iface.address}:${port}`;
    }
  }
  return rawBase;
}

/**
 * File-upload bridge for the live Selenium submission. When the government
 * portal asks for a file, the runner pauses and the kiosk opens an upload
 * overlay; the citizen either captures with the kiosk camera or scans a QR to
 * upload from their phone. Both routes POST here, which hands the file to the
 * runner via the citizen-input channel.
 */
@ApiTags('selenium / upload bridge')
@Controller('selenium/upload')
export class SeleniumUploadController {
  constructor(private jobs: SeleniumJobService) {}

  @Post('session/:jobId')
  @ApiOperation({ summary: 'Kiosk: create an upload session for a job (returns token + QR URL)' })
  createSession(@Param('jobId') jobId: string, @Body('baseUrl') baseUrl?: string) {
    const { token } = this.jobs.createUploadSession(jobId);
    const apiBase = resolvePublicBaseUrl(baseUrl ?? process.env.PUBLIC_API_URL ?? 'http://localhost:4000');
    return {
      token,
      mobileUrl: `${apiBase}/selenium/upload/${token}`,
      qrUrl: `${apiBase}/selenium/upload/${token}/qr.png`,
    };
  }

  @Get(':token/qr.png')
  @ApiOperation({ summary: 'QR PNG encoding the phone upload URL' })
  async qr(@Param('token') token: string, @Res() res: Response, @Body('baseUrl') baseUrl?: string) {
    const sess = this.jobs.getUploadSession(token);
    if (!sess) throw new NotFoundException('Phiên tải tệp không tồn tại.');
    const apiBase = resolvePublicBaseUrl(baseUrl ?? process.env.PUBLIC_API_URL ?? 'http://localhost:4000');
    const buf = await QRCode.toBuffer(`${apiBase}/selenium/upload/${token}`, { width: 320, margin: 1 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }

  @Get(':token')
  @ApiOperation({ summary: 'Phone: mobile upload page' })
  page(@Param('token') token: string, @Res() res: Response) {
    const sess = this.jobs.getUploadSession(token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!sess) {
      res.send('<h2 style="font-family:sans-serif;text-align:center;margin-top:40px">Phiên tải tệp đã hết hạn.</h2>');
      return;
    }
    res.send(UPLOAD_PAGE_HTML(token, !!sess.fileUrl));
  }

  @Post(':token')
  @ApiOperation({ summary: 'Phone/Kiosk: upload the file (multipart field "file")' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @Param('token') token: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Không có tệp nào được tải lên.');
    return this.jobs.receiveUpload(token, file.buffer, file.originalname);
  }
}

/* ─── Mobile upload page (served to phones via QR) ─────────── */
function UPLOAD_PAGE_HTML(token: string, alreadyDone: boolean): string {
  return `<!doctype html><html lang="vi"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Tải tài liệu lên kiosk</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;color:#0f172a;padding:20px;min-height:100vh}
  .card{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:26px;box-shadow:0 8px 30px rgba(15,23,42,.1)}
  h1{font-size:20px;margin-bottom:6px}
  p{color:#64748b;font-size:14px;line-height:1.5;margin-bottom:20px}
  label{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:2px dashed #cbd5e1;border-radius:16px;padding:34px 16px;cursor:pointer;background:#f8fafc}
  label .ic{font-size:42px}
  label span{font-weight:700;color:#2563eb}
  input[type=file]{display:none}
  #preview{margin-top:16px;border-radius:12px;overflow:hidden;display:none}
  #preview img{width:100%;display:block}
  button{width:100%;margin-top:18px;padding:16px;border:none;border-radius:14px;background:#2563eb;color:#fff;font-size:17px;font-weight:800;cursor:pointer}
  button:disabled{opacity:.5}
  .ok{text-align:center;color:#16a34a;font-weight:800;font-size:18px;margin-top:18px}
  .err{color:#dc2626;text-align:center;margin-top:12px;font-weight:600}
</style></head><body>
<div class="card">
  <h1>Tải tài liệu lên</h1>
  <p>Chụp ảnh hoặc chọn tệp giấy tờ cần đính kèm. Tệp sẽ được gửi tới kiosk và đính kèm vào hồ sơ của bạn.</p>
  <label for="f">
    <div class="ic">📄</div>
    <span>Chạm để chụp ảnh / chọn tệp</span>
  </label>
  <input id="f" type="file" accept="image/*,application/pdf" capture="environment"/>
  <div id="preview"><img id="img"/></div>
  <button id="send" disabled>Gửi lên kiosk</button>
  <div id="msg"></div>
</div>
<script>
  var token=${JSON.stringify(token)};
  var f=document.getElementById('f'),send=document.getElementById('send'),
      prev=document.getElementById('preview'),img=document.getElementById('img'),msg=document.getElementById('msg');
  var picked=null;
  f.addEventListener('change',function(){
    picked=f.files[0]||null;
    if(picked){send.disabled=false;
      if(picked.type.indexOf('image')===0){img.src=URL.createObjectURL(picked);prev.style.display='block';}
      else{prev.style.display='none';}
    }
  });
  send.addEventListener('click',function(){
    if(!picked)return;
    send.disabled=true;send.textContent='Đang gửi…';msg.textContent='';msg.className='';
    var fd=new FormData();fd.append('file',picked);
    fetch('/selenium/upload/'+token,{method:'POST',body:fd})
      .then(function(r){if(!r.ok)throw new Error('Lỗi '+r.status);return r.json();})
      .then(function(){msg.className='ok';msg.textContent='✓ Đã gửi! Quay lại màn hình kiosk để tiếp tục.';send.style.display='none';})
      .catch(function(e){msg.className='err';msg.textContent='Gửi thất bại: '+e.message;send.disabled=false;send.textContent='Gửi lên kiosk';});
  });
  ${alreadyDone ? "msg.className='ok';msg.textContent='Tệp đã được gửi trước đó.';" : ''}
</script>
</body></html>`;
}
