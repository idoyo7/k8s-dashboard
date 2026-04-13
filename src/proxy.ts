import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BASE_PATH = '/awsops';
const EXPLORER_PATH = `${BASE_PATH}/k8s/explorer`;
const ALLOWED_PATH_PREFIXES = [
  `${BASE_PATH}/api`,
  `${BASE_PATH}/_next`,
  `${BASE_PATH}/logos`,
];
const ALLOWED_EXACT_PATHS = new Set([
  EXPLORER_PATH,
  `${BASE_PATH}/favicon.ico`,
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(BASE_PATH)) {
    return NextResponse.next();
  }

  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
    return NextResponse.redirect(new URL(EXPLORER_PATH, request.url));
  }

  if (ALLOWED_EXACT_PATHS.has(pathname) || ALLOWED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(EXPLORER_PATH, request.url));
}

export const config = {
  matcher: ['/awsops/:path*'],
};
