import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const MAX_AGE = 60 * 60 * 8; // 8h — matches the API token expiry

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "Không kết nối được máy chủ. Kiểm tra API." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ message: data?.message ?? "Đăng nhập thất bại." }, { status: res.status });
  }

  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE };
  jar.set("hcc_token", data.accessToken, opts);
  jar.set("hcc_user", JSON.stringify(data.user), opts);
  // Non-httpOnly companion so client code can attach audit headers (actor id|name).
  jar.set(
    "hcc_actor",
    `${data.user?.id ?? ""}|${data.user?.fullName ?? ""}`,
    { httpOnly: false, sameSite: "lax", path: "/", maxAge: MAX_AGE },
  );

  return NextResponse.json({ user: data.user });
}
