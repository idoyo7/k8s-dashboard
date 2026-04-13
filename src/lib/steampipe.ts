import { Pool } from 'pg';
import NodeCache from 'node-cache';
import { getConfig } from '@/lib/app-config';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Steampipe 비밀번호: config에서 읽기, 환경변수 폴백
// Steampipe password: from config, env var fallback
function createPool(): Pool {
  const spPassword = getConfig().steampipePassword
    || process.env.STEAMPIPE_PASSWORD
    || 'steampipe';
  return new Pool({
    host: '127.0.0.1',
    port: 9193,
    database: 'steampipe',
    user: 'steampipe',
    password: spPassword,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  });
}

let pool = createPool();

// Kill zombie PostgreSQL connections on startup and periodically
// 앱 시작 시 + 주기적으로 좀비 PostgreSQL 연결 정리
const ZOMBIE_MAX_MINUTES = 5; // Kill queries running longer than 5 min / 5분 이상 실행 쿼리 종료
let zombieCleanupStarted = false;

async function cleanupZombieConnections(): Promise<number> {
  try {
    // Only kill connections from the app (client_addr = 127.0.0.1 with SELECT queries).
    // Exclude Steampipe internal FDW/plugin connections (client_addr IS NULL).
    // 앱 커넥션만 정리 — Steampipe 내부 FDW/플러그인 커넥션(client_addr IS NULL) 제외
    const result = await pool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE state = 'active'
        AND pid != pg_backend_pid()
        AND client_addr IS NOT NULL
        AND query LIKE 'SELECT %'
        AND query NOT LIKE '%pg_terminate%'
        AND query NOT LIKE '%pg_stat_activity%'
        AND query_start < NOW() - INTERVAL '${ZOMBIE_MAX_MINUTES} minutes'
    `);
    const killed = result.rowCount || 0;
    if (killed > 0) {
      console.log(`[Pool] Cleaned up ${killed} zombie connection(s) (>${ZOMBIE_MAX_MINUTES}min)`);
    }
    return killed;
  } catch {
    return 0;
  }
}

export function startZombieCleanup(): void {
  if (zombieCleanupStarted) return;
  zombieCleanupStarted = true;
  // Initial cleanup after 3s / 3초 후 초기 정리
  setTimeout(() => cleanupZombieConnections(), 3000);
  // Periodic cleanup every 2 minutes / 2분마다 주기적 정리
  setInterval(() => cleanupZombieConnections(), 2 * 60 * 1000);
}

const ALLOWED_PATTERN = /^\s*SELECT\s/i;

function validateQuery(sql: string): void {
  if (!ALLOWED_PATTERN.test(sql.trim())) {
    throw new Error('Only SELECT queries are allowed');
  }
  if (/[|&`]/.test(sql)) {
    throw new Error('Query contains forbidden characters');
  }
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  opts?: boolean | { bustCache?: boolean; ttl?: number }
): Promise<{ rows: T[]; error?: string }> {
  const { bustCache = false, ttl } = typeof opts === 'boolean'
    ? { bustCache: opts, ttl: undefined }
    : (opts || {});
  const cacheKey = `sp:${sql}`;

  if (!bustCache) {
    const cached = cache.get<{ rows: T[] }>(cacheKey);
    if (cached) return cached;
  }

  try {
    validateQuery(sql);
    const result = await pool.query(sql);
    const rows: T[] = result.rows || [];
    const data = { rows };
    if (ttl) {
      cache.set(cacheKey, data, ttl);
    } else {
      cache.set(cacheKey, data);
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { rows: [], error: message };
  }
}

export async function batchQuery(
  queries: Record<string, string>,
  opts?: boolean | { bustCache?: boolean; ttl?: number }
): Promise<Record<string, { rows: unknown[]; error?: string }>> {
  const normalizedOpts = typeof opts === 'boolean'
    ? { bustCache: opts }
    : (opts || {});

  const results: Record<string, { rows: unknown[]; error?: string }> = {};
  const entries = Object.entries(queries);

  // Run in sequential batches of 8 (leaves 2 pool slots for other requests)
  // 8개씩 병렬 실행 (다른 요청을 위해 풀 슬롯 2개 여유)
  const BATCH_SIZE = 8;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(([, sql]) => runQuery(sql, normalizedOpts))
    );
    batch.forEach(([key], j) => {
      const s = settled[j];
      if (s.status === 'fulfilled') {
        results[key] = s.value;
      } else {
        results[key] = { rows: [], error: s.reason?.message || 'Query failed' };
      }
    });
  }

  return results;
}

export function clearCache(): void {
  cache.flushAll();
}

// Reset pool and flush cache / 풀 리셋 및 캐시 초기화
export async function resetPool(): Promise<void> {
  try { await pool.end(); } catch { /* ignore */ }
  pool = createPool();
  cache.flushAll();
  for (let i = 0; i < 15; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
}
