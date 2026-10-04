import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next 는 basePath('/awsops')를 뗀 경로로 nextUrl.pathname 과 matcher 를 다룬다.
const EXPLORER_PATH = '/k8s/explorer';
const ALLOWED_PATH_PREFIXES = ['/api', '/_next', '/logos'];
const ALLOWED_EXACT_PATHS = new Set([EXPLORER_PATH, '/favicon.ico']);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    ALLOWED_EXACT_PATHS.has(pathname) ||
    ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = EXPLORER_PATH;
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/', '/((?!_next/static|_next/image).*)'],
};
