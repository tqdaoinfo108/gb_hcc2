import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { forwardAuditHeaders } from "../../../../lib/forward-audit";

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:3001";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.text();
    const response = await fetch(
      `${API_URL}/kiosk-devices/${encodeURIComponent(id)}/config`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await forwardAuditHeaders()) },
        body,
        cache: "no-store",
      },
    );
    const payload = await response.text();
    if (response.ok) {
      revalidatePath("/devices");
      revalidatePath(`/devices/${id}`);
    }
    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "CMS không thể kết nối tới Kiosk API.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
