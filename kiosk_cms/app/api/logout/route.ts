import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const jar = await cookies();
  jar.delete("hcc_token");
  jar.delete("hcc_user");
  return NextResponse.json({ ok: true });
}
