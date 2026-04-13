'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Box,
  Terminal,
  DollarSign,
  GitBranch,
  DatabaseZap,
  SearchCode,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  subItems?: NavItem[];
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    titleKey: '',
    items: [
      { labelKey: 'sidebar.dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    titleKey: 'sidebar.kubernetes',
    items: [
      { labelKey: 'sidebar.eks', href: '/k8s', icon: Box },
      { labelKey: 'sidebar.eksExplorer', href: '/k8s/explorer', icon: Terminal },
      { labelKey: 'sidebar.eksContainerCost', href: '/eks-container-cost', icon: DollarSign },
      { labelKey: 'sidebar.topology', href: '/topology', icon: GitBranch },
    ],
  },
  {
    titleKey: 'sidebar.monitoring',
    items: [
      { labelKey: 'sidebar.datasources', href: '/datasources', icon: DatabaseZap, subItems: [
        { labelKey: 'sidebar.datasources', href: '/datasources', icon: DatabaseZap },
        { labelKey: 'sidebar.datasourceExplore', href: '/datasources/explore', icon: SearchCode },
      ]},
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const [customerLogo, setCustomerLogo] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerLogoBg, setCustomerLogoBg] = useState<string>('dark');
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/awsops/api/steampipe?action=config')
      .then(r => r.json())
      .then(d => {
        if (d.customerLogo) setCustomerLogo(d.customerLogo);
        if (d.customerName) setCustomerName(d.customerName);
        if (d.customerLogoBg) setCustomerLogoBg(d.customerLogoBg);
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    const path = pathname.replace('/awsops', '') || '/';
    if (href === '/') return path === '/';
    return path.startsWith(href);
  };

  const toggleMenu = (href: string) => {
    setExpandedMenus(prev => ({ ...prev, [href]: !prev[href] }));
  };

  const isMenuExpanded = (item: NavItem) => {
    if (expandedMenus[item.href] !== undefined) return expandedMenus[item.href];
    return item.subItems?.some(sub => isActive(sub.href)) ?? false;
  };

  const toggleLang = () => {
    setLang(lang === 'ko' ? 'en' : 'ko');
  };

  const renderNavItem = (item: NavItem) => {
    if (item.subItems) {
      const expanded = isMenuExpanded(item);
      const anySubActive = item.subItems.some(sub => isActive(sub.href));
      const Icon = item.icon;

      return (
        <div key={item.href + '-group'}>
          <button
            onClick={() => toggleMenu(item.href)}
            className={`
              w-full flex items-center gap-3 px-4 py-2.5 text-[15px] transition-colors relative
              ${
                anySubActive
                  ? 'text-accent-cyan border-l-2 border-accent-cyan bg-navy-700/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50 border-l-2 border-transparent'
              }
            `}
          >
            <Icon size={18} />
            <span className="flex-1 text-left">{t(item.labelKey)}</span>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expanded && (
            <div className="space-y-0.5">
              {item.subItems.map(sub => {
                const path = pathname.replace('/awsops', '') || '/';
                const subActive = sub.href === item.href
                  ? path === sub.href
                  : isActive(sub.href);
                const SubIcon = sub.icon;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={`
                      flex items-center gap-3 pl-8 pr-4 py-2 text-[13px] transition-colors relative
                      ${
                        subActive
                          ? 'bg-navy-700 text-accent-cyan border-l-2 border-accent-cyan'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50 border-l-2 border-transparent'
                      }
                    `}
                  >
                    <SubIcon size={16} />
                    <span>{t(sub.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`
          flex items-center gap-3 px-4 py-2.5 text-[15px] transition-colors relative
          ${
            active
              ? 'bg-navy-700 text-accent-cyan border-l-2 border-accent-cyan'
              : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50 border-l-2 border-transparent'
          }
        `}
      >
        <Icon size={18} />
        <span>{t(item.labelKey)}</span>
      </Link>
    );
  };

  return (
    <aside className="w-60 min-w-[240px] h-screen bg-navy-800 border-r border-navy-600 flex flex-col shrink-0">
      {/* Customer Logo (from config) */}
      {customerLogo && (
        <div className={`px-5 py-3 border-b border-navy-600 flex items-center justify-center ${customerLogoBg === 'light' ? 'bg-white/95' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/awsops/logos/${customerLogo}`}
            alt={customerName || 'Customer'}
            className="object-contain max-h-[40px] max-w-[180px]"
          />
        </div>
      )}

      {/* Logo + Language Toggle */}
      <div className="px-5 py-4 border-b border-navy-600 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-accent-cyan tracking-tight">K8s Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('sidebar.tagline')}</p>
        </div>
        <div className="flex items-center gap-1">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="px-2 py-1 rounded-md text-accent-cyan border border-accent-cyan/30 bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-colors"
            title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'}
          >
            <span className="text-[11px] font-bold font-mono">{lang === 'ko' ? 'EN' : '한'}</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-2 mx-4 border-t border-navy-600/50" />}
            {group.titleKey && (
              <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {t(group.titleKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-navy-600">
        <p className="text-xs text-gray-600 font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION || '1.8.0'}</p>
      </div>
    </aside>
  );
}
