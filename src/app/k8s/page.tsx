'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Box, Rocket, Network, Server, AlertTriangle, ExternalLink } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { useLanguage } from '@/lib/i18n/LanguageContext';

// Format K8s memory values (e.g. "32986188Ki" → "31.5 GiB")
function formatK8sMemory(mem: any): string {
  if (!mem) return '--';
  const s = String(mem);
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|K|M|G|T|k|m|g|t)?$/);
  if (!match) return s;
  let value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'ki' || unit === 'k') value = value / 1024;
  else if (unit === 'gi' || unit === 'g') value = value * 1024;
  else if (unit === 'ti' || unit === 't') value = value * 1024 * 1024;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} TiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GiB`;
  if (value >= 1) return `${Math.round(value)} MiB`;
  return `${Math.round(value * 1024)} KiB`;
}

// Parse K8s CPU (e.g. "8" → 8, "7910m" → 7.91)
function parseCpu(cpu: any): number {
  if (!cpu) return 0;
  const s = String(cpu).trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  return parseFloat(s) || 0;
}

// Parse K8s memory to MiB
function parseMiB(mem: any): number {
  if (!mem) return 0;
  const s = String(mem);
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti)?$/i);
  if (!match) return parseInt(s) || 0;
  let v = parseFloat(match[1]);
  const u = (match[2] || '').toLowerCase();
  if (u === 'ki') v = v / 1024;
  else if (u === 'gi') v = v * 1024;
  else if (u === 'ti') v = v * 1024 * 1024;
  return Math.round(v);
}

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function K8sOverviewPage() {
  const { t } = useLanguage();

  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            nodeSummary: k8sQ.nodeSummary,
            podSummary: k8sQ.podSummary,
            deploymentSummary: k8sQ.deploymentSummary,
            nodeList: k8sQ.nodeList,
            nodeCapacity: k8sQ.nodeCapacity,
            podList: k8sQ.podList,
            podRequests: k8sQ.podRequests,
            serviceList: k8sQ.serviceList,
            podsPerNamespace: k8sQ.podsPerNamespace,
            warningEvents: k8sQ.warningEvents,
            deploymentList: k8sQ.deploymentList,
          },
        }),
      });
      setData(await res.json());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const nodeSummary = getFirst('nodeSummary') as any;
  const podSummary = getFirst('podSummary') as any;
  const deploySummary = getFirst('deploymentSummary') as any;
  const nodes = get('nodeList');
  const podReqRows = get('podRequests');
  const services = get('serviceList');
  const events = get('warningEvents');
  const deployments = get('deploymentList');

  // Aggregate pod requests per node
  const reqMap: Record<string, { cpuReq: number; memReqMiB: number; podCount: number }> = {};
  podReqRows.forEach((r: any) => {
    const node = String(r.node_name || '');
    if (!node) return;
    if (!reqMap[node]) reqMap[node] = { cpuReq: 0, memReqMiB: 0, podCount: 0 };
    reqMap[node].podCount += 1;
    if (r.cpu_req) reqMap[node].cpuReq += parseCpu(r.cpu_req);
    if (r.mem_req) reqMap[node].memReqMiB += parseMiB(r.mem_req);
  });

  // Pod status pie data
  const podStatusData = [
    { name: 'Running', value: Number(podSummary.running_pods) || 0 },
    { name: 'Pending', value: Number(podSummary.pending_pods) || 0 },
    { name: 'Failed', value: Number(podSummary.failed_pods) || 0 },
    { name: 'Succeeded', value: Number(podSummary.succeeded_pods) || 0 },
  ].filter((d) => d.value > 0);

  // Pods per namespace bar data
  const podsPerNs = get('podsPerNamespace');
  const podsPerNsData = podsPerNs.map((r: any) => ({
    name: r.namespace,
    value: Number(r.pod_count) || 0,
  }));

  // Deployment health: desired vs available
  const replicaData = useMemo(() => deployments.slice(0, 20).map((d: any) => ({
    name: d.name,
    desired: Number(d.replicas) || 0,
    available: Number(d.available_replicas) || 0,
  })), [deployments]);

  const quickLinks = [
    { label: t('k8s.pods'), href: '/awsops/k8s/pods', icon: Box, color: 'text-accent-green' },
    { label: t('k8s.nodes'), href: '/awsops/k8s/nodes', icon: Server, color: 'text-accent-cyan' },
    { label: t('k8s.deployments'), href: '/awsops/k8s/deployments', icon: Rocket, color: 'text-accent-purple' },
    { label: t('k8s.services'), href: '/awsops/k8s/services', icon: Network, color: 'text-accent-orange' },
    { label: 'Explorer', href: '/awsops/k8s/explorer', icon: ExternalLink, color: 'text-accent-cyan' },
  ];

  return (
    <div className="min-h-screen">
      <Header
        title={t('k8s.title')}
        subtitle={t('k8s.subtitle')}
        onRefresh={() => fetchData(true)}
      />

      <main className="p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label={t('k8s.nodes')}
            value={nodeSummary.total_nodes ?? '-'}
            icon={Server}
            color="cyan"
            change={`${nodeSummary.ready_nodes ?? 0} ready / ${(Number(nodeSummary.total_nodes) || 0) - (Number(nodeSummary.ready_nodes) || 0)} not-ready`}
            href="/k8s/nodes"
          />
          <StatsCard
            label={t('k8s.pods')}
            value={podSummary.total_pods ?? '-'}
            icon={Box}
            color="green"
            change={`${podSummary.running_pods ?? 0} running / ${podSummary.pending_pods ?? 0} pending / ${podSummary.failed_pods ?? 0} failed`}
            href="/k8s/pods"
          />
          <StatsCard
            label={t('k8s.deployments')}
            value={deploySummary.total_deployments ?? '-'}
            icon={Rocket}
            color="purple"
            change={`${deploySummary.fully_available ?? 0} available / ${deploySummary.partially_available ?? 0} partial`}
            href="/k8s/deployments"
          />
          <StatsCard
            label={t('k8s.services')}
            value={services.length}
            icon={Network}
            color="orange"
            href="/k8s/services"
          />
        </div>

        {/* Node Resource Utilization */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">{t('k8s.nodes')} — Resource Utilization</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU Usage per node */}
            <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
              <h3 className="text-sm font-semibold text-white mb-1">CPU Usage per Node</h3>
              <p className="text-xs text-gray-500 mb-3">Pod Requested / Allocatable / Capacity</p>
              <div className="flex items-center gap-4 text-[10px] mb-4">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-cyan inline-block" /> Requested</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-green/30 inline-block" /> Available</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" /> System Reserved</span>
              </div>
              <div className="space-y-4">
                {nodes.map((n: any) => {
                  const cap = parseCpu(n.capacity_cpu) || 1;
                  const alloc = parseCpu(n.allocatable_cpu) || 0;
                  const req = reqMap[n.name]?.cpuReq || 0;
                  const pods = reqMap[n.name]?.podCount || 0;
                  const reserved = cap - alloc;
                  const available = alloc - req;
                  const reqPct = Math.round((req / cap) * 100);
                  const availPct = Math.round((available / cap) * 100);
                  const resPct = 100 - reqPct - availPct;
                  return (
                    <div key={`cpu-${n.name}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-400 font-mono truncate max-w-[180px]">{n.name.split('.')[0]}</span>
                        <span className="text-white font-mono">{req.toFixed(1)} / {cap} vCPU <span className={`${reqPct >= 80 ? 'text-accent-red' : reqPct >= 50 ? 'text-accent-orange' : 'text-accent-cyan'}`}>({reqPct}%)</span></span>
                      </div>
                      <div className="h-5 bg-navy-900 rounded-full overflow-hidden flex">
                        <div className={`h-full ${reqPct >= 80 ? 'bg-accent-red' : reqPct >= 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`} style={{ width: `${reqPct}%` }} />
                        <div className="h-full bg-accent-green/30" style={{ width: `${availPct}%` }} />
                        <div className="h-full bg-gray-700" style={{ width: `${resPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] mt-0.5 text-gray-500">
                        <span>{pods} pods, req {req.toFixed(2)} vCPU</span>
                        <span>avail {available.toFixed(2)} | rsv {reserved.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
                {nodes.length === 0 && !loading && <p className="text-gray-500 text-sm">No nodes</p>}
              </div>
            </div>

            {/* Memory Usage per node */}
            <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
              <h3 className="text-sm font-semibold text-white mb-1">Memory Usage per Node</h3>
              <p className="text-xs text-gray-500 mb-3">Pod Requested / Allocatable / Capacity</p>
              <div className="flex items-center gap-4 text-[10px] mb-4">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-purple inline-block" /> Requested</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-green/30 inline-block" /> Available</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" /> System Reserved</span>
              </div>
              <div className="space-y-4">
                {nodes.map((n: any) => {
                  const capMiB = parseMiB(n.capacity_memory) || 1;
                  const allocMiB = parseMiB(n.allocatable_memory) || 0;
                  const reqMiB = reqMap[n.name]?.memReqMiB || 0;
                  const pods = reqMap[n.name]?.podCount || 0;
                  const reservedMiB = capMiB - allocMiB;
                  const availMiB = allocMiB - reqMiB;
                  const reqPct = Math.round((reqMiB / capMiB) * 100);
                  const availPct = Math.round((availMiB / capMiB) * 100);
                  const resPct = 100 - reqPct - availPct;
                  return (
                    <div key={`mem-${n.name}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-400 font-mono truncate max-w-[180px]">{n.name.split('.')[0]}</span>
                        <span className="text-white font-mono">{formatK8sMemory(`${reqMiB}Mi`)} / {formatK8sMemory(`${capMiB}Mi`)} <span className={`${reqPct >= 80 ? 'text-accent-red' : reqPct >= 50 ? 'text-accent-orange' : 'text-accent-purple'}`}>({reqPct}%)</span></span>
                      </div>
                      <div className="h-5 bg-navy-900 rounded-full overflow-hidden flex">
                        <div className={`h-full ${reqPct >= 80 ? 'bg-accent-red' : reqPct >= 50 ? 'bg-accent-orange' : 'bg-accent-purple'}`} style={{ width: `${reqPct}%` }} />
                        <div className="h-full bg-accent-green/30" style={{ width: `${availPct}%` }} />
                        <div className="h-full bg-gray-700" style={{ width: `${resPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] mt-0.5 text-gray-500">
                        <span>{pods} pods, req {formatK8sMemory(`${reqMiB}Mi`)}</span>
                        <span>avail {formatK8sMemory(`${availMiB}Mi`)} | rsv {formatK8sMemory(`${reservedMiB}Mi`)}</span>
                      </div>
                    </div>
                  );
                })}
                {nodes.length === 0 && !loading && <p className="text-gray-500 text-sm">No nodes</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Pod Status + Pods per Namespace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PieChartCard title="Pod Status Distribution" data={podStatusData} />
          <BarChartCard title="Pods per Namespace" data={podsPerNsData} color="#00d4ff" />
        </div>

        {/* Deployment Health */}
        {replicaData.length > 0 && (
          <div className="bg-navy-800 border border-navy-600 rounded-lg p-5">
            <h3 className="text-white font-semibold mb-4">Deployment Health (Desired vs Available)</h3>
            <div className="space-y-2">
              {replicaData.map((d: any) => (
                <div key={d.name} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 font-mono w-48 truncate">{d.name}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-4 bg-navy-700 rounded-full overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-accent-cyan/30 rounded-full"
                        style={{ width: d.desired > 0 ? '100%' : '0%' }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-accent-green rounded-full"
                        style={{ width: d.desired > 0 ? `${(d.available / d.desired) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-gray-400 font-mono text-xs w-16 text-right">
                      {d.available}/{d.desired}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning Events */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-accent-orange" />
            Warning Events
          </h2>
          <DataTable
            columns={[
              { key: 'involved_object_kind', label: 'Kind' },
              { key: 'involved_object_name', label: 'Object' },
              { key: 'reason', label: 'Reason' },
              { key: 'message', label: 'Message' },
              { key: 'count', label: 'Count' },
              { key: 'last_timestamp', label: 'Last Seen' },
            ]}
            data={events}
          />
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            {quickLinks.map(({ label, href, icon: Icon, color }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-800 border border-navy-600 hover:border-accent-cyan/40 transition-colors text-sm text-gray-300 hover:text-white"
              >
                <Icon size={15} className={color} />
                {label}
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
