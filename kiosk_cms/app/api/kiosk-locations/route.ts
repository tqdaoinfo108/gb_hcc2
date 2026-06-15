import { NextRequest, NextResponse } from "next/server";
import { forwardAuditHeaders } from "../../lib/forward-audit";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export async function GET() {
  return proxy("/kiosk-devices/locations", { method: "GET", cache: "no-store" });
}

export async function POST(request: NextRequest) {
  return proxy("/kiosk-devices/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await forwardAuditHeaders()) },
    body: await request.text(),
    cache: "no-store",
  });
}

async function proxy(path: string, init: RequestInit) {
  try {
    const response = await fetch(`${API_URL}${path}`, init);
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: "CMS không thể kết nối tới Kiosk API.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
