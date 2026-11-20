import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, Gift, Zap } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';

/* ------------------------------------------------------------------ */
/* Count-up                                                            */
/* ------------------------------------------------------------------ */
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function CountUp({ value, format, duration = 1100 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [v, setV] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setV(value); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      setV(Math.round(a + (value - a) * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <>
      <span aria-hidden>{format(v)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome banner with the cap-and-books illustration                  */
/* ------------------------------------------------------------------ */
export function WelcomeBanner({ title, subtitle, action }: { title: string; subtitle: ReactNode; action?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-white/60 bg-[linear-gradient(110deg,#CDEFE3_0%,#D6ECF8_48%,#E4E2FF_100%)] dark:border-white/5 dark:bg-[linear-gradient(110deg,#123A35_0%,#16304F_50%,#262559_100%)]">
      <div className="relative z-10 max-w-[62%] px-6 py-6 sm:max-w-[60%] sm:px-9 sm:py-8">
        <h1 className="text-[22px] leading-tight font-bold tracking-[-0.01em] text-[#17204A] sm:text-[30px] dark:text-white">{title}</h1>
        <p className="mt-1.5 text-[14px] text-[#2C3866] sm:text-[17px] dark:text-white/75">{subtitle}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
      <BannerArt className="absolute right-0 bottom-0 h-full w-[44%] max-w-[380px] sm:w-[40%]" />
    </section>
  );
}

function BannerArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 380 150" preserveAspectRatio="xMaxYMax meet" className={className} aria-hidden>
      {/* leaves */}
      <g fill="#3FB48A">
        <path d="M70 150c-6-30 2-62 26-84-2 30-8 58-26 84z" opacity=".75" />
        <path d="M58 150c-22-20-30-46-24-74 16 22 24 46 24 74z" opacity=".55" />
        <path d="M86 150c10-24 30-38 56-42-14 20-32 34-56 42z" opacity=".6" />
        <path d="M330 150c4-34-6-66-32-88 0 32 10 62 32 88z" opacity=".75" />
        <path d="M346 150c22-22 28-50 20-78-16 24-22 50-20 78z" opacity=".55" />
        <path d="M318 150c-12-22-32-34-58-36 16 18 34 30 58 36z" opacity=".6" />
      </g>
      {/* books */}
      <rect x="128" y="120" width="170" height="22" rx="4" fill="#E9575E" />
      <rect x="128" y="120" width="170" height="5" rx="2" fill="#fff" opacity=".55" />
      <rect x="138" y="100" width="150" height="21" rx="4" fill="#2F6FE0" />
      <rect x="138" y="100" width="150" height="4" rx="2" fill="#fff" opacity=".5" />
      <rect x="148" y="82" width="132" height="19" rx="4" fill="#F2B44B" />
      <rect x="148" y="82" width="132" height="4" rx="2" fill="#fff" opacity=".5" />
      {/* cap */}
      <path d="M214 30 140 58l74 28 74-28z" fill="#1E3A8A" />
      <path d="M214 30 140 58l74 28 74-28z" fill="url(#capShine)" />
      <path d="M180 72v14c0 9 15 15 34 15s34-6 34-15V72l-34 13z" fill="#172E6E" />
      <path d="M276 63v26" stroke="#F2B44B" strokeWidth="3" strokeLinecap="round" />
      <circle cx="276" cy="92" r="5" fill="#F2B44B" />
      <defs>
        <linearGradient id="capShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".25" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Pastel money card                                                   */
/* ------------------------------------------------------------------ */
const TONES = {
  good: { card: 'bg-[linear-gradient(135deg,#E6F7EF,#D6F1E4)] border-[#CBEBDB] dark:bg-[linear-gradient(135deg,#10302A,#0F2722)] dark:border-[#1D4A3C]', icon: 'bg-[linear-gradient(135deg,#29C17E,#12965E)]' },
  bad: { card: 'bg-[linear-gradient(135deg,#FDEDEE,#FBE0E2)] border-[#F6D2D5] dark:bg-[linear-gradient(135deg,#3A1A22,#2E161D)] dark:border-[#55262F]', icon: 'bg-[linear-gradient(135deg,#F2666B,#D9363C)]' },
  info: { card: 'bg-[linear-gradient(135deg,#E8F0FF,#DDE6FF)] border-[#D2DDFA] dark:bg-[linear-gradient(135deg,#17254A,#141E3E)] dark:border-[#26386A]', icon: 'bg-[linear-gradient(135deg,#4C8DFF,#2F63E0)]' },
} as const;

export function MoneyCard({ tone, icon, label, value, delta, upIsGood = true, sub }: {
  tone: keyof typeof TONES; icon: ReactNode; label: string; value: number; delta?: number | null; upIsGood?: boolean; sub?: ReactNode;
}) {
  const { t, money, num } = useI18n();
  const up = (delta ?? 0) >= 0;
  const good = up === upIsGood;
  return (
    <div className={cn('flex items-center gap-4 rounded-[20px] border p-5 sm:p-6', TONES[tone].card)}>
      <span className={cn('grid size-14 shrink-0 place-items-center rounded-full text-white shadow-[0_10px_22px_-10px_rgba(0,0,0,.45)] [&_svg]:size-6 sm:size-16', TONES[tone].icon)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink-2 sm:text-[15px]">{label}</div>
        <div className={cn('num mt-0.5 text-[26px] leading-tight font-bold tracking-[-0.02em] sm:text-[32px]', value < 0 ? 'text-bad' : 'text-ink')}>
          <CountUp value={value} format={money} />
        </div>
        {delta != null && Number.isFinite(delta) ? (
          <div className={cn('mt-1 flex items-center gap-1 text-[12.5px] font-medium', good ? 'text-good' : 'text-bad')}>
            {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            <span className="num">{up ? '+' : '−'}{num(Math.abs(Math.round(delta)))}%</span>
            <span className="text-ink-3">{t('vsLastMonth')}</span>
          </div>
        ) : sub ? <div className="mt-1 text-[12.5px] text-ink-3">{sub}</div> : null}
      </div>
    </div>
  );
}

export function percentChange(cur: number, prev: number | undefined | null) {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/* ------------------------------------------------------------------ */
/* Section header used in the dashboard cards                          */
/* ------------------------------------------------------------------ */
export function KitHeader({ icon, title, action }: { icon: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <h2 className="flex min-w-0 items-center gap-2.5 text-[16px] font-bold text-ink sm:text-[17px]">
        <span className="text-brand [&_svg]:size-5">{icon}</span>
        <span className="truncate">{title}</span>
      </h2>
      {action}
    </div>
  );
}

export function SeeAll({ to }: { to: string }) {
  const { t } = useI18n();
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5 text-[12.5px] font-semibold text-brand hover:bg-brand/15">
      {t('seeAll')} <ArrowRight className="size-3.5" />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Today's birthday                                                    */
/* ------------------------------------------------------------------ */
const CONFETTI_COLORS = ['#7B5CE6', '#5B6CFF', '#F2B44B', '#29C17E', '#F2666B', '#4C8DFF'];
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({
      left: `${(i * 37) % 100}%`, delay: `${(i % 9) * 70}ms`, dx: `${((i * 53) % 120) - 60}px`,
      rot: `${360 + ((i * 97) % 540)}deg`, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], w: 5 + (i % 3) * 2, round: i % 4 === 0,
    })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className={cn('absolute top-0 block', p.round ? 'rounded-full' : 'rounded-[1px]')}
          style={{ left: p.left, width: p.w, height: p.round ? p.w : p.w * 1.8, background: p.color,
            animation: `confetti-fall 1900ms cubic-bezier(.2,.6,.4,1) ${p.delay} both`, '--dx': p.dx, '--rot': p.rot } as CSSProperties} />
      ))}
    </div>
  );
}

export function TodayBirthdayCard({ names, next, wishLabel = true }: { names: string[]; next?: { name: string; when: string } | null; wishLabel?: boolean }) {
  const { t } = useI18n();
  const has = names.length > 0;
  const shareWish = async () => {
    const text = `${t('happyBirthday')}, ${names.join(' & ')}! ${t('wishQuote')}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success(t('wishCopied'));
    } catch { /* user closed the share sheet */ }
  };
  return (
    <Card className="relative overflow-hidden">
      <KitHeader
        icon={<CakeIcon />}
        title={<>{t('birthdaysToday')} {has && <span aria-hidden>🎂</span>}</>}
        action={has && wishLabel ? (
          <button onClick={shareWish} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#6C63FF,#8B5CF6)] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(108,99,255,.9)] hover:brightness-110">
            <Gift className="size-4" /> {t('sendWish')}
          </button>
        ) : undefined}
      />
      {has ? (
        <div className="relative flex flex-col items-center gap-4 px-5 py-6 text-center sm:flex-row sm:items-center sm:gap-5 sm:px-7 sm:text-left">
          <Confetti />
          <div className="relative shrink-0">
            <div className="flex -space-x-5">
              {names.slice(0, 3).map((n) => <Avatar key={n} name={n} className="size-20 ring-4 sm:size-28" />)}
            </div>
            <Sprinkles />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="text-[19px] leading-snug font-bold text-ink sm:text-[22px]">{names.join(' & ')}</div>
            <div className="mt-0.5 text-[18px] font-bold text-violet sm:text-[22px]">{t('happyBirthday')}!</div>
            <p className="mt-3 rounded-[14px] bg-violet-soft px-4 py-3 text-[14px] leading-relaxed text-ink-2">“{t('wishQuote')}”</p>
          </div>
          <CakeArt className="relative hidden w-[130px] shrink-0 md:block" />
        </div>
      ) : (
        <div className="flex items-center gap-4 px-5 py-7 sm:px-7">
          <CakeArt className="w-[84px] shrink-0 opacity-80" />
          <div>
            <div className="text-[16px] font-semibold text-ink">{t('noBirthdayToday')}</div>
            {next && <div className="mt-1 text-[14px] text-ink-3">{t('nextBirthday')}: <span className="font-semibold text-ink-2">{next.name}</span> · {next.when}</div>}
          </div>
        </div>
      )}
    </Card>
  );
}

function CakeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" /><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" /><path d="M2 21h20" /><path d="M7 8v3M12 8v3M17 8v3" /><path d="M7 4h.01M12 4h.01M17 4h.01" /></svg>;
}

function Sprinkles() {
  const dots = [[-8, 12, '#7B5CE6'], [104, 6, '#F2B44B'], [-4, 88, '#29C17E'], [110, 80, '#F2666B'], [50, -6, '#4C8DFF']] as const;
  return (
    <>
      {dots.map(([x, y, c], i) => <span key={i} aria-hidden className="absolute size-2 rotate-45 rounded-[2px]" style={{ left: x, top: y, background: c }} />)}
    </>
  );
}

function CakeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 130" className={className} aria-hidden>
      <ellipse cx="70" cy="122" rx="58" ry="7" fill="#17204A" opacity=".08" />
      <ellipse cx="70" cy="114" rx="60" ry="9" fill="#F2666B" />
      <path d="M22 70h96v40c0 6-21 10-48 10s-48-4-48-10z" fill="#FFD6E2" />
      <path d="M22 70h96v12c-8 6-16-2-24 4s-16-2-24 4-16-2-24 4-16-2-24-4z" fill="#FFF2F6" />
      <ellipse cx="70" cy="70" rx="48" ry="9" fill="#FFF7FA" />
      <path d="M32 92h76" stroke="#F49AB6" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 9" />
      {[46, 70, 94].map((x, i) => (
        <g key={x}>
          <rect x={x - 4} y="38" width="8" height="30" rx="3" fill={['#8B7CF6', '#5B9BFF', '#F2B44B'][i]} />
          <path d={`M${x} 22c5 6 5 11 0 14-5-3-5-8 0-14z`} fill="#FFB43A" />
          <path d={`M${x} 27c2 3 2 6 0 8-2-2-2-5 0-8z`} fill="#FFF0B8" />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* This month's birthdays                                              */
/* ------------------------------------------------------------------ */
const BADGE_TONES = [
  'bg-good-soft text-good',
  'bg-info-soft text-info',
  'bg-violet-soft text-violet',
  'bg-warn-soft text-warn',
];

export function MonthBirthdayList({ items, todayDay, seeAllTo }: { items: Array<{ name: string; day: number; dateLabel: string }>; todayDay: number; seeAllTo?: string }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col">
      <KitHeader icon={<CalendarDays />} title={t('birthdaysThisMonth')} action={seeAllTo ? <SeeAll to={seeAllTo} /> : undefined} />
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-ink-3">{t('noBirthdaysMonth')}</p>
      ) : (
        <ul className="scrollbar-thin max-h-[300px] divide-y divide-line overflow-y-auto">
          {items.map((b, i) => (
            <li key={`${b.name}-${i}`} className={cn('flex items-center gap-3 px-5 py-2.5', b.day < todayDay && 'opacity-55', b.day === todayDay && 'bg-violet-soft/60')}>
              <Avatar name={b.name} className="size-9" />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink">{b.name}</span>
              <span className={cn('num shrink-0 rounded-[9px] px-2.5 py-1 text-[12.5px] font-semibold', b.day === todayDay ? 'bg-[linear-gradient(135deg,#6C63FF,#8B5CF6)] text-white' : BADGE_TONES[i % BADGE_TONES.length])}>
                {b.day === todayDay ? `🎂 ${t('todayLabel')}` : b.dateLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */
export interface ActivityItem { id: string; kind: 'in' | 'out'; label: string; amount: number; at: string }

export function relativeTime(iso: string, lang: 'bn' | 'en') {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'bn' ? 'bn' : 'en', { numeric: 'auto' });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(0, 'second');
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (86400 * 30)), 'month');
}

export function ActivityList({ items, seeAllTo }: { items: ActivityItem[]; seeAllTo?: string }) {
  const { t, money, lang } = useI18n();
  return (
    <Card className="flex flex-col">
      <KitHeader icon={<Zap className="fill-[#F2B44B] text-[#F2B44B]" />} title={t('recentActivity')} action={seeAllTo ? <SeeAll to={seeAllTo} /> : undefined} />
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-ink-3">{t('noActivity')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-white', a.kind === 'in' ? 'bg-good' : 'bg-bad')}>
                {a.kind === 'in' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{a.label}</span>
              <span className={cn('num shrink-0 text-[14.5px] font-semibold', a.kind === 'in' ? 'text-ink' : 'text-ink')}>{money(a.amount)}</span>
              <span className="hidden w-[92px] shrink-0 text-right text-[12px] text-ink-3 sm:block">{relativeTime(a.at, lang)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
