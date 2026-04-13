import { NextRequest, NextResponse } from 'next/server';
import { batchQuery, clearCache } from '@/lib/steampipe';
import { getConfig, saveConfig } from '@/lib/app-config';
import { getCacheWarmerStatus, ensureCacheWarmerStarted } from '@/lib/cache-warmer';

export async function GET(request: NextRequest) {
  // Auto-start cache warmer on first request / 첫 요청 시 캐시 워머 자동 시작
  ensureCacheWarmerStarted();

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'config') {
    return NextResponse.json(getConfig());
  }

  if (action === 'cache-status') {
    return NextResponse.json(getCacheWarmerStatus());
  }

  return NextResponse.json(
    { error: 'Unknown action. Valid: config, cache-status' },
    { status: 400 }
  );
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'config') {
      const body = await request.json();
      saveConfig(body);
      clearCache();
      return NextResponse.json(getConfig());
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Auto-start cache warmer on first request / 첫 요청 시 캐시 워머 자동 시작
  ensureCacheWarmerStarted();

  try {
    const { searchParams } = new URL(request.url);
    const bustCache = searchParams.get('bustCache') === 'true';

    const body = await request.json();
    const { queries } = body as {
      queries: Record<string, string>;
    };

    if (!queries || typeof queries !== 'object') {
      return NextResponse.json(
        { error: 'Request body must contain a "queries" object' },
        { status: 400 }
      );
    }

    if (bustCache) {
      clearCache();
    }

    const results = await batchQuery(queries, { bustCache });

    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

