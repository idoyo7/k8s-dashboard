import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const CONFIG_PATH = resolve(process.cwd(), 'data/config.json');

// External datasource types (Grafana-style) / 외부 데이터소스 타입 (Grafana 스타일)
export type DatasourceType = 'prometheus' | 'loki' | 'tempo' | 'clickhouse' | 'jaeger' | 'dynatrace' | 'datadog';

export interface DatasourceAuth {
  type: 'none' | 'basic' | 'bearer' | 'custom-header';
  username?: string;
  password?: string;
  token?: string;
  headerName?: string;
  headerValue?: string;
}

export interface DatasourceSettings {
  timeout?: number;        // ms, default 30000
  cacheTTL?: number;       // seconds, default 60
  database?: string;       // ClickHouse database name
  customHeaders?: Record<string, string>;
}

export interface DatasourceConfig {
  id: string;              // UUID
  name: string;            // "Production Prometheus"
  type: DatasourceType;
  url: string;             // "http://prometheus:9090"
  isDefault?: boolean;     // Default datasource per type / 타입별 기본 데이터소스
  auth?: DatasourceAuth;
  settings?: DatasourceSettings;
  createdAt: string;       // ISO timestamp
  updatedAt: string;
}

export interface AppConfig {
  steampipePassword?: string;
  opencostEndpoint?: string;   // OpenCost API endpoint / OpenCost API 엔드포인트
  customerLogo?: string;       // Customer logo path in public/logos/ / 고객 로고 경로
  customerName?: string;       // Customer name displayed next to logo / 로고 옆에 표시할 고객명
  customerLogoBg?: string;     // Logo background: "light" or "dark" / 로고 배경
  datasources?: DatasourceConfig[];  // External datasources / 외부 데이터소스
  datasourceAllowedNetworks?: string[];  // Allowed private CIDRs/hostnames for SSRF allowlist
}

const DEFAULT_CONFIG: AppConfig = {};

// 캐시된 config (60초 TTL) / Cached config with 60s TTL
let _configCache: AppConfig | null = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 60000;

export function getConfig(): AppConfig {
  const now = Date.now();
  if (_configCache && now - _configCacheTime < CONFIG_CACHE_TTL) return _configCache;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed: AppConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    _configCache = parsed;
    _configCacheTime = now;
    return parsed;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<AppConfig>): void {
  const current = getConfig();
  const merged = { ...current, ...config };
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  _configCache = merged as AppConfig;
  _configCacheTime = Date.now();
}

// --- Datasource utilities / 데이터소스 유틸리티 ---

export function getDatasources(): DatasourceConfig[] {
  return getConfig().datasources || [];
}

export function getDatasourceById(id: string): DatasourceConfig | undefined {
  return getDatasources().find(d => d.id === id);
}

export function getDefaultDatasource(type: DatasourceType): DatasourceConfig | undefined {
  const byType = getDatasources().filter(d => d.type === type);
  return byType.find(d => d.isDefault) || byType[0];
}

export function getDatasourcesByType(type: DatasourceType): DatasourceConfig[] {
  return getDatasources().filter(d => d.type === type);
}

export function getDatasourceAllowedNetworks(): string[] {
  return getConfig().datasourceAllowedNetworks || [];
}
