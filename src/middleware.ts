/**
 * Password-protects the creator side when SONAR_PASSWORD is set.
 *
 * Open to everyone: respondent pages (/s/...) and the endpoints a
 * respondent needs. Everything else (dashboard, responses, insights, settings,
 * testing tools) asks for the password via the browser's sign-in prompt.
 * Use it over https only (Codespaces and tunnels give you https).
 */
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [
  /^\/s\/[^/]+\/?$/,
  /^\/api\/public\/[^/]+(\/(start|complete))?$/,
  /^\/api\/voice-answers$/,
  /^\/api\/answers$/,
  /^\/api\/conversation\/(preview|burst|next|finish)$/,
  /^\/_next\//,
  /^\/icon\.svg$/,
  /^\/favicon\.ico$/,
];

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.SONAR_PASSWORD?.trim();
  if (!password) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(supplied, password)) return NextResponse.next();
    } catch {
      /* malformed header */
    }
  }
  return new NextResponse("Sign in to see your Sonar workspace.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sonar", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
  runtime: "nodejs",
};
