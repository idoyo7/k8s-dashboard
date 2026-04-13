'use client';

import { LanguageProvider } from '@/lib/i18n/LanguageContext';

// Client-side providers wrapper
export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {children}
    </LanguageProvider>
  );
}
