'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import {
  Server, Box, AlertTriangle, RefreshCw, Layers, Network, FolderOpen,
} from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

// Clickable card wrapper
function CardLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <div onClick={() => router.push(href)}
      className={`cursor-pointer transition-all hover:scale-[1.02] hover:border-accent-cyan/30 ${className}`}>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useLanguage();

  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<any>(null);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const url = bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            k8sNodes: k8sQ.nodeSummary,
            k8sPods: k8sQ.podSummary,
            k8sDeploy: k8sQ.deploymentSummary,
            k8sWarnings: k8sQ.warningEvents,
            k8sPodsPerNs: k8sQ.podsPerNamespace,
            k8sServiceList: k8sQ.serviceList,
            k8sNamespace: k8sQ.namespaceSummary,
          },
        }),
      });
      setData(await res.json());
      fetch('/awsops/api/steampipe?action=cache-status').then(r => r.json()).then(d => setCacheStatus(d)).catch(() => {});
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Cache warmer status
    fetch('/awsops/api/steampipe?action=cache-status')
      .then(r => r.json())
      .then(d => setCacheStatus(d))
      .catch(() => {});
    fetchData();
  }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const k8sNodes = getFirst('k8sNodes') as any;
  const podSum = getFirst('k8sPods') as any;
  const k8sDeploy = getFirst('k8sDeploy') as any;
  const k8sNamespace = getFirst('k8sNamespace') as any;
  const k8sWarnings = get('k8sWarnings');
  const k8sPodsPerNs = get('k8sPodsPerNs');
  const k8sServiceList = get('k8sServiceList');

  const totalPods = Number(podSum?.total_pods) || 0;
  const runningPods = Number(podSum?.running_pods) || 0;
  const totalServices = k8sServiceList.length;
  const totalNamespaces = Number(k8sNamespace?.total_namespaces) || 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title={t('dashboard.title')} onRefresh={() => fetchData(true)} />

      {/* Loading progress bar */}
      {loading && (
        <div className="w-full h-1 bg-navy-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Row 1: K8s Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <CardLink href="/k8s/nodes">
          <StatsCard label={t('dashboard.k8sNodes')} value={Number(k8sNodes?.total_nodes) || 0} icon={Server} color="cyan"
            change={t('dashboard.eksChange', { ready: Number(k8sNodes?.ready_nodes) || 0, pods: totalPods, deploy: Number(k8sDeploy?.total_deployments) || 0 })} />
        </CardLink>
        <CardLink href="/k8s/pods">
          <StatsCard label={t('dashboard.k8sPods')} value={runningPods} icon={Box} color="green"
            change={`${totalPods} ${t('common.total')} · ${Number(podSum?.pending_pods) || 0} ${t('common.pending')} · ${Number(podSum?.failed_pods) || 0} ${t('common.failed')}`} />
        </CardLink>
        <CardLink href="/k8s/deployments">
          <StatsCard label={t('dashboard.k8sDeployments')} value={Number(k8sDeploy?.total_deployments) || 0} icon={Layers} color="purple"
            change={`${Number(k8sDeploy?.ready_deployments) || 0} ${t('common.ready')}`} />
        </CardLink>
        <CardLink href="/k8s/services">
          <StatsCard label={t('dashboard.k8sServices')} value={totalServices} icon={Network} color="orange"
            change={t('dashboard.k8sServicesChange')} />
        </CardLink>
        <CardLink href="/k8s">
          <StatsCard label={t('dashboard.k8sNamespaces')} value={totalNamespaces} icon={FolderOpen} color="cyan"
            change={t('dashboard.k8sNamespacesChange')} />
        </CardLink>
      </div>

      {/* Row 2: Charts + Warning Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PieChartCard title={t('dashboard.k8sPodStatus')} data={[
          { name: t('common.running'), value: Number(podSum?.running_pods) || 0 },
          { name: t('common.pending'), value: Number(podSum?.pending_pods) || 0 },
          { name: t('common.failed'), value: Number(podSum?.failed_pods) || 0 },
          { name: t('common.succeeded'), value: Number(podSum?.succeeded_pods) || 0 },
        ].filter(d => d.value > 0)} />

        <BarChartCard title={t('dashboard.podsPerNamespace')} data={k8sPodsPerNs.map((r: any) => ({
          name: String(r.namespace),
          value: Number(r.pod_count) || 0,
        })).slice(0, 10)} />

        {/* K8s Warning Events */}
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-orange" />
            {t('dashboard.recentK8sEvents')}
          </h3>
          {k8sWarnings.length === 0 && !loading ? (
            <p className="text-gray-500 text-sm">{t('dashboard.noWarningEvents')}</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {k8sWarnings.slice(0, 8).map((ev: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-navy-900 text-xs">
                  <AlertTriangle size={11} className="text-accent-orange mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-gray-400">{String(ev.namespace)}/{String(ev.name)}</span>
                    <span className="text-gray-600 ml-2">{String(ev.reason)}</span>
                    <p className="text-gray-300 mt-0.5">{String(ev.message).slice(0, 100)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cache Warmer Status Bar */}
      {cacheStatus && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-navy-800/60 border border-navy-600/50 text-[11px] font-mono text-gray-500">
          <div className="flex items-center gap-1.5">
            <RefreshCw size={12} className={cacheStatus.isRunning ? 'text-accent-cyan animate-spin' : 'text-gray-600'} />
            <span className="text-gray-400">{t('dashboard.cacheWarmer')}</span>
          </div>
          {cacheStatus.lastWarmedAt && (
            <>
              <span>{t('dashboard.lastCached')}: <span className="text-accent-green">{getTimeAgo(cacheStatus.lastWarmedAt, t)}</span></span>
              <span className="text-gray-600">|</span>
              <span>{t('dashboard.duration')}: <span className="text-accent-cyan">{cacheStatus.lastDurationSec}s</span></span>
              <span className="text-gray-600">|</span>
              <span>{t('dashboard.queries')}: <span className="text-gray-300">{cacheStatus.dashboardQueries + cacheStatus.monitoringQueries}</span></span>
              <span className="text-gray-600">|</span>
              <span>{t('dashboard.refreshCycle')}: <span className="text-gray-300">{cacheStatus.intervalMin}{t('dashboard.min')}</span></span>
              <span className="text-gray-600">|</span>
              <span>{t('dashboard.warmCount')}: <span className="text-accent-purple">{cacheStatus.warmCount}</span></span>
            </>
          )}
          {cacheStatus.isRunning && (
            <span className="text-accent-cyan">{t('dashboard.warming')}</span>
          )}
          {!cacheStatus.lastWarmedAt && !cacheStatus.isRunning && (
            <span className="text-gray-600">{t('dashboard.waitingFirstWarm')}</span>
          )}
          {cacheStatus.lastError && (
            <span className="text-accent-red">Error: {cacheStatus.lastError}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Helper: relative time display
function getTimeAgo(isoString: string, t: (key: string, params?: any) => string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return t('dashboard.secondsAgo', { count: diff });
  if (diff < 3600) return t('dashboard.minutesAgo', { count: Math.floor(diff / 60) });
  return t('dashboard.hoursAgo', { count: Math.floor(diff / 3600) });
}
