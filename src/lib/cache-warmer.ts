// Cache pre-warming: background refresh for K8s dashboard queries
// 캐시 프리워밍: K8s 대시보드 쿼리 백그라운드 갱신
// Runs on server start + every 4 minutes (before 5-min cache TTL expires)
// 서버 시작 시 + 4분마다 실행 (5분 캐시 TTL 만료 전)

import { batchQuery, startZombieCleanup } from '@/lib/steampipe';
import { queries as k8sQ } from '@/lib/queries/k8s';

const WARM_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes / 4분
let warmingTimer: ReturnType<typeof setInterval> | null = null;
let isWarming = false;
let initialized = false; // Lazy-init flag / 지연 초기화 플래그

// ============================================================================
// Cache warmer status tracking / 캐시 워머 상태 추적
// ============================================================================
interface CacheWarmerStatus {
  isRunning: boolean;           // Currently warming / 현재 워밍 중
  lastWarmedAt: string | null;  // Last successful warm timestamp / 마지막 성공 시각
  lastDurationSec: number | null; // Last warm duration in seconds / 마지막 소요 시간
  warmCount: number;            // Total successful warms since start / 시작 이후 총 성공 횟수
  lastError: string | null;     // Last error message / 마지막 에러
  startedAt: string | null;     // Server start time / 서버 시작 시각
  intervalMin: number;          // Refresh interval in minutes / 갱신 주기 (분)
  dashboardQueries: number;     // Number of dashboard queries / 대시보드 쿼리 수
  monitoringQueries: number;    // Number of monitoring queries / 모니터링 쿼리 수
  metricCacheTtlMin: number;    // Metric cache TTL in minutes / 메트릭 캐시 TTL (분)
}

const status: CacheWarmerStatus = {
  isRunning: false,
  lastWarmedAt: null,
  lastDurationSec: null,
  warmCount: 0,
  lastError: null,
  startedAt: null,
  intervalMin: WARM_INTERVAL_MS / 60000,
  dashboardQueries: 0,
  monitoringQueries: 0,
  metricCacheTtlMin: 0,
};

// Export status getter / 상태 조회 함수
export function getCacheWarmerStatus(): CacheWarmerStatus {
  return { ...status, isRunning: isWarming };
}

// K8s dashboard queries / K8s 대시보드 쿼리
function getDashboardQueries(): Record<string, string> {
  return {
    k8sNodes: k8sQ.nodeSummary,
    k8sPods: k8sQ.podSummary,
    k8sDeploy: k8sQ.deploymentSummary,
    k8sWarnings: k8sQ.warningEvents,
    k8sServiceList: k8sQ.serviceList,
    k8sNamespace: k8sQ.namespaceSummary,
    k8sPodsPerNs: k8sQ.podsPerNamespace,
    k8sNodeList: k8sQ.nodeList,
    k8sPodReqs: k8sQ.podRequests,
    k8sPodList: k8sQ.podList,
    k8sSvcResources: k8sQ.serviceResources,
    k8sNodeCap: k8sQ.nodeCapacity,
    k8sPodReqsCtx: k8sQ.podRequestsWithContext,
  };
}

async function warmCache(): Promise<void> {
  if (isWarming) return; // Skip if already running / 이미 실행 중이면 스킵
  isWarming = true;
  const start = Date.now();

  try {
    const dashQueries = getDashboardQueries();
    status.dashboardQueries = Object.keys(dashQueries).length;
    await batchQuery(dashQueries);

    const elapsed = (Date.now() - start) / 1000;
    status.lastWarmedAt = new Date().toISOString();
    status.lastDurationSec = Math.round(elapsed * 10) / 10;
    status.warmCount++;
    status.lastError = null;
    console.log(`[CacheWarmer] Warmed dashboard (${status.dashboardQueries}) cache in ${elapsed.toFixed(1)}s`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    status.lastError = message;
    console.error(`[CacheWarmer] Failed: ${message}`);
  } finally {
    isWarming = false;
  }
}

// Start background cache warming / 백그라운드 캐시 워밍 시작
export function startCacheWarmer(): void {
  if (warmingTimer) return; // Already started / 이미 시작됨

  status.startedAt = new Date().toISOString();
  console.log('[CacheWarmer] Starting background cache warming (interval: 4min)');

  // Start zombie connection cleanup alongside cache warmer
  // 캐시 워머와 함께 좀비 연결 정리 시작
  startZombieCleanup();

  // Initial warm after 5s delay (let server fully start) / 서버 시작 5초 후 초기 워밍
  setTimeout(() => {
    warmCache();
  }, 5000);

  // Periodic refresh every 4 minutes / 4분마다 주기적 갱신
  warmingTimer = setInterval(() => {
    warmCache();
  }, WARM_INTERVAL_MS);
}

// Stop background cache warming / 백그라운드 캐시 워밍 중지
export function stopCacheWarmer(): void {
  if (warmingTimer) {
    clearInterval(warmingTimer);
    warmingTimer = null;
    console.log('[CacheWarmer] Stopped background cache warming');
  }
}

// Lazy-init: auto-start on first API request (more reliable than instrumentation.ts)
// 지연 초기화: 첫 API 요청 시 자동 시작 (instrumentation.ts보다 안정적)
export function ensureCacheWarmerStarted(): void {
  if (initialized) return;
  initialized = true;
  startCacheWarmer();
}
