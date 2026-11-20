import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/lib/theme';
import { Logo } from '@/components/layout/Logo';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';

export function AuthLayout({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[radial-gradient(120%_90%_at_0%_0%,#2B3F8F_0%,#14224D_55%,#0F1A3D_100%)] lg:block">
        <svg className="absolute inset-0 h-full w-full opacity-[0.14]" aria-hidden>
          <defs>
            <pattern id="ledger" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M0 35.5H36" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ledger)" />
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3">
            <Logo tone="white" className="h-10" />
            <span className="text-[17px] font-semibold">{t('appName')}</span>
          </Link>
          <div className="max-w-md">
            <Logo full tone="white" className="max-w-[340px]" />
            <p className="mt-10 text-[30px] leading-[1.2] font-semibold tracking-tight">{t('tagline')}</p>
          </div>
          <p className="text-[13px] opacity-70">{t('footerOrg')}</p>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <Link to="/" className="flex items-center gap-2 lg:invisible">
            <Logo small />
            <span className="text-[15px] font-semibold">{t('appName')}</span>
          </Link>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}><Globe />{t('language')}</Button>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}>{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-10">
          <div className="w-full max-w-[380px]">
            <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
            {body && <p className="mt-2 text-[14px] text-ink-3">{body}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
        <Footer compact className="mx-5" />
      </div>
    </div>
  );
}
