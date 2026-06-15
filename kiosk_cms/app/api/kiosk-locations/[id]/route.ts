import { NextRequest, NextResponse } from "next/server";
import { forwardAuditHeaders } from "../../../lib/forward-audit";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const response = await fetch(`${API_URL}/kiosk-devices/locations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await forwardAuditHeaders()) },
      body: await request.text(),
      cache: "no-store",
    });
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
