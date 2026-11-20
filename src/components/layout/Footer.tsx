import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';

const FB_PAGE = 'https://www.facebook.com/share/151KfhnvMyg/';
const DEV_PROFILE = 'https://www.facebook.com/share/1J2ugBqA3M/';

/** Site footer: class identity, Facebook page, rights line and developer credit. */
export function Footer({ className, compact }: { className?: string; compact?: boolean }) {
  const { t, year } = useI18n();
  const y = year(Number(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric' })));
  return (
    <footer className={cn('no-print border-t border-line text-[13px] text-ink-3', className)}>
      {!compact && (
        <div className="flex flex-col items-center gap-4 py-7 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Logo className="h-10" />
            <span className="max-w-[300px] leading-snug">{t('footerOrg')}</span>
          </div>
          <a
            href={FB_PAGE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#1877F2] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(24,119,242,.9)] hover:brightness-110"
          >
            <FbIcon /> {t('footerFb')}
          </a>
        </div>
      )}
      <div className={cn('flex flex-col items-center gap-1.5 text-center sm:flex-row sm:justify-between sm:text-left', compact ? 'py-4' : 'border-t border-line py-4')}>
        <span className="num">{t('footerRights', { y })}</span>
        <span>
          {t('footerDev')}{' '}
          <a href={DEV_PROFILE} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">Tahsin BN</a>
          {compact && (
            <>
              {' · '}
              <a href={FB_PAGE} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1877F2] hover:underline">{t('footerFb')}</a>
            </>
          )}
        </span>
      </div>
    </footer>
  );
}

function FbIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21z" />
    </svg>
  );
}
