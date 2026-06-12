import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate the whole CMS behind login. Presence of the httpOnly `hcc_token` cookie
 * (set only on a successful API login) is required for every page; otherwise
 * redirect to /login. API routes + static assets are excluded by the matcher.
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get("hcc_token")?.value;
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  if (!token && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (token && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|globals.css).*)"],
};
