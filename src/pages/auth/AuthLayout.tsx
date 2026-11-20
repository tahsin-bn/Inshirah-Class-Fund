import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/lib/theme';
import { Logo } from '@/components/layout/Logo';
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
            <Logo className="size-11" />
            <span className="text-[17px] font-semibold">{t('appName')}</span>
          </Link>
          <div className="max-w-md">
            <p className="text-[34px] leading-[1.15] font-semibold tracking-tight">{t('tagline')}</p>
            <div className="mt-8 flex items-end gap-2" aria-hidden>
              {[38, 52, 46, 64, 58, 76, 70, 88].map((h, i) => (
                <div key={i} className="w-6 origin-bottom rounded-t-[4px] bg-[linear-gradient(180deg,#8B9BFF,#7B5CE6)] animate-[rise_700ms_cubic-bezier(.2,.8,.2,1)_both]" style={{ height: h, animationDelay: `${i * 60}ms`, opacity: 0.35 + i * 0.08 }} />
              ))}
              <div className="mb-[92px] size-4 rounded-full bg-brass" />
            </div>
          </div>
          <p className="text-[13px] opacity-70">© {new Date().getFullYear()} {t('appName')}</p>
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
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-[380px]">
            <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
            {body && <p className="mt-2 text-[14px] text-ink-3">{body}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
