import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cake, Globe, LogIn, Moon, PartyPopper, ShieldCheck, Sun } from 'lucide-react';
import { usePublicDashboard } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { pct } from '@/lib/format';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { CategoryBars } from '@/components/charts/CategoryBars';

/* ------------------------------------------------------------------ */
/* Count-up: numbers roll up once when they first appear.              */
/* ------------------------------------------------------------------ */
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useCountUp(target: number, duration = 1100) {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setV(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 4);
      setV(Math.round(a + (target - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function CountUp({ value, format, duration }: { value: number; format: (n: number) => string; duration?: number }) {
  const v = useCountUp(value, duration);
  return (
    <>
      <span aria-hidden>{format(v)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One-time confetti burst for the birthday card                       */
/* ------------------------------------------------------------------ */
const CONFETTI_COLORS = ['#C9973F', '#E7C46F', '#11624B', '#3FBF94', '#E38B6D', '#F5F7F4'];
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 9) * 70}ms`,
      dx: `${((i * 53) % 120) - 60}px`,
      rot: `${360 + ((i * 97) % 540)}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 5 + (i % 3) * 2,
      round: i % 4 === 0,
    })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn('absolute top-0 block', p.round ? 'rounded-full' : 'rounded-[1px]')}
          style={{
            left: p.left, width: p.w, height: p.round ? p.w : p.w * 1.8, background: p.color,
            animation: `confetti-fall 1900ms cubic-bezier(.2,.6,.4,1) ${p.delay} both`,
            '--dx': p.dx, '--rot': p.rot,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

export default function PublicDashboard() {
  const { t, lang, setLang, money, num, year, date, month: monthLabel, pick, dateTime } = useI18n();
  const { theme, toggle } = useTheme();
  const { session } = useAuth();
  const { data, isLoading, error, refetch } = usePublicDashboard();
  const months = useMemo(() => data?.months ?? [], [data]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && months.length) setSelected(months[months.length - 1].id);
  }, [months, selected]);

  const current = months.find((m) => m.id === selected) ?? months[months.length - 1];
  const maxBalance = Math.max(1, ...months.map((m) => Math.abs(m.closing_balance)), Math.abs(data?.totals?.balance ?? 0));
  const cats = (data?.categories ?? []).filter((c) => c.month_id === current?.id).map((c) => ({ name: lang === 'bn' ? c.name_bn : c.name_en, amount: c.amount }));
  const items = (data?.expenses ?? []).filter((e) => e.month_id === current?.id);
  const balance = data?.totals?.balance ?? 0;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo small />
            <span className="max-w-[44vw] truncate text-[15px] font-semibold sm:max-w-none">{data?.app_name ?? t('appName')}</span>
          </Link>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}><Globe /><span className="hidden sm:inline">{t('language')}</span></Button>
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}>{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          <Link to={session ? '/app' : '/login'}>
            <Button variant="secondary" size="sm"><LogIn />{session ? t('navDashboard') : t('staffSignIn')}</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 pb-16 sm:px-6">
        {isLoading ? (
          <div className="space-y-4 pt-6"><Skeleton className="h-64 rounded-[24px]" /><Skeleton className="h-40" /><Skeleton className="h-56" /></div>
        ) : error ? (
          <div className="pt-10"><ErrorState error={error} onRetry={() => refetch()} /></div>
        ) : !data?.enabled ? (
          <p className="pt-20 text-center text-ink-3">{t('publicOff')}</p>
        ) : (
          <>
            {/* ---------------- Hero: the balance ---------------- */}
            <section className="relative mt-5 overflow-hidden rounded-[24px] bg-[#0C4A39] text-[#F1F5F2] shadow-[0_24px_48px_-28px_rgba(12,74,57,.7)] dark:bg-[#0F3B2F] sm:mt-8">
              <div className="hero-pattern absolute inset-0" aria-hidden />
              <div aria-hidden className="absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(201,151,63,.28),transparent)]" />
              <div className="relative px-6 pb-7 pt-7 sm:px-10 sm:pb-10 sm:pt-10">
                <p className="text-[14px] text-[#B9CEC5]">{data.class_name}</p>
                <h1 className="mt-1 text-[16px] font-medium">{t('publicBalance')}</h1>
                <div className={cn('num mt-2 text-[56px] leading-[0.95] font-semibold tracking-[-0.035em] sm:text-[88px]', balance < 0 && 'text-[#FFB4AC]')}>
                  <CountUp value={balance} format={money} duration={1400} />
                </div>

                <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/12 pt-5 sm:grid-cols-4">
                  <HeroStat label={t('totalCollected')} value={<CountUp value={data.totals?.collected ?? 0} format={money} />} dot="#3FBF94" />
                  <HeroStat label={t('totalSpent')} value={<CountUp value={data.totals?.expenses ?? 0} format={money} />} dot="#E7C46F" />
                  {!!data.totals?.other_income && <HeroStat label={t('otherIncome')} value={<CountUp value={data.totals.other_income} format={money} />} dot="#9CC3E6" />}
                  <HeroStat label={t('activeStudents')} value={<CountUp value={data.active_students ?? 0} format={num} duration={900} />} />
                </dl>
              </div>
            </section>

            {/* ---------------- Today's birthday wish ---------------- */}
            {!!data.birthdays_today?.length && <BirthdayWish names={data.birthdays_today} />}

            {months.length === 0 ? (
              <Card className="mt-6 p-8 text-center text-ink-3">{t('noMonthsYet')}</Card>
            ) : (
              <>
                {/* ---------------- Month ledger strip ---------------- */}
                <section aria-labelledby="ledger-h" className="mt-8 mb-6">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 id="ledger-h" className="text-[17px] font-semibold">{t('publicLedger')}</h2>
                    <p className="hidden text-[13px] text-ink-3 sm:block">{t('publicLedgerHint')}</p>
                  </div>
                  <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                    <div className="flex min-w-max items-end gap-2" role="listbox" aria-label={t('publicLedger')}>
                      {months.map((m, i) => {
                        const h = 24 + (Math.abs(m.closing_balance) / maxBalance) * 120;
                        const active = m.id === current?.id;
                        return (
                          <button
                            key={m.id}
                            role="option"
                            aria-selected={active}
                            onClick={() => setSelected(m.id)}
                            className={cn('group flex w-[78px] flex-col items-stretch gap-1.5 rounded-[12px] p-1.5 text-left transition-colors sm:w-[92px]', active ? 'bg-surface shadow-[var(--shadow-card)] ring-1 ring-line' : 'hover:bg-surface/70')}
                          >
                            <span className="num truncate text-[12px] font-medium text-ink-2">{money(m.closing_balance)}</span>
                            <span
                              className={cn('block w-full origin-bottom rounded-[6px]', m.closing_balance < 0 ? 'bg-bad/70' : active ? 'bg-brand' : 'bg-brand/35 group-hover:bg-brand/55')}
                              style={{ height: h, animation: `rise 700ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms both` }}
                            />
                            <span className={cn('text-[12px]', active ? 'font-semibold text-ink' : 'text-ink-3')}>{monthLabel(m).replace(/\s\S+$/, '')}</span>
                            <span className="num -mt-1 text-[11px] text-ink-3">{year(m.year)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* ---------------- Selected month ---------------- */}
                {current && (
                  <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]" aria-live="polite">
                    <Card>
                      <CardHeader
                        title={monthLabel(current)}
                        description={`${money(current.contribution)} ${t('perStudent')}${current.special_label ? ` · ${current.special_label}` : ''}`}
                        action={<StatusBadge status={current.status} />}
                      />
                      <CardBody className="space-y-5">
                        <div>
                          <div className="mb-2 flex items-baseline justify-between text-[13px]">
                            <span className="text-ink-3">{t('collectionProgress')}</span>
                            <span className="num text-[15px] font-semibold text-brand"><CountUp key={current.id} value={pct(current.collected, current.expected)} format={num} duration={900} />%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                            <div
                              key={current.id}
                              className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-[#3FBF94]"
                              style={{ width: `${Math.min(100, pct(current.collected, current.expected))}%`, animation: 'grow-x 900ms cubic-bezier(.2,.8,.2,1) both' }}
                            />
                          </div>
                          <p className="mt-2 text-[13px] text-ink-3">{t('studentsPaid', { n: current.paid_count + current.waived_count, m: current.students_due })}</p>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
                          <Row label={t('openingBalance')} value={money(current.opening_balance)} />
                          <Row label={t('expected')} value={money(current.expected)} />
                          <Row label={t('collected')} value={money(current.collected)} tone="text-brand" />
                          <Row label={t('approvedSpending')} value={money(current.expenses)} tone="text-brass" />
                          {current.other_income > 0 && <Row label={t('otherIncome')} value={money(current.other_income)} />}
                          <Row label={t('closingBalance')} value={<CountUp key={current.id} value={current.closing_balance} format={money} duration={900} />} strong />
                        </dl>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardHeader title={t('whereMoneyWent')} />
                      <CardBody>
                        {cats.length ? <CategoryBars items={cats} /> : <p className="py-6 text-center text-[14px] text-ink-3">{t('noExpensesYet')}</p>}
                      </CardBody>
                    </Card>

                    {items.length > 0 && (
                      <Card className="lg:col-span-2">
                        <CardHeader title={t('approvedSpending')} description={monthLabel(current)} />
                        <ul className="divide-y divide-line border-t border-line">
                          {items.map((e) => (
                            <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[14px] font-medium">{e.title}</div>
                                <div className="text-[12px] text-ink-3">{lang === 'bn' ? e.category_bn : e.category_en} · {date(e.spent_on)}</div>
                              </div>
                              <div className="num text-[14px] font-semibold">{money(e.amount)}</div>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </section>
                )}
              </>
            )}

            {/* ---------------- This month's birthdays ---------------- */}
            {data.birthdays_month && data.today && <MonthBirthdays list={data.birthdays_month} today={data.today} />}

            <p className="mt-8 flex items-start gap-2 text-[13px] text-ink-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
              <span>
                {t('privacyNote')} {data.generated_at && <>{pick('Figures as of', 'হিসাব হালনাগাদ')} {dateTime(data.generated_at)}.</>}
              </span>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function HeroStat({ label, value, dot }: { label: string; value: ReactNode; dot?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[13px] text-[#B9CEC5]">
        {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
        {label}
      </dt>
      <dd className="num mt-0.5 text-[19px] font-semibold sm:text-[22px]">{value}</dd>
    </div>
  );
}

function BirthdayWish({ names }: { names: string[] }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('birthdaysToday')}
      className="relative mt-5 overflow-hidden rounded-[22px] border border-[#E9D3A4] bg-[linear-gradient(135deg,#FBF3E1_0%,#F6E6C3_100%)] text-[#3A2A10] dark:border-[#5A4520] dark:bg-[linear-gradient(135deg,#2C2312_0%,#3A2D14_100%)] dark:text-[#F4E6C8]"
      style={{ animation: 'wish-in 600ms cubic-bezier(.2,.8,.2,1) 300ms both' }}
    >
      <Confetti />
      <div className="relative flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-7">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[#C9973F] text-white shadow-[0_8px_20px_-8px_rgba(201,151,63,.9)]">
          <Cake className="size-7" />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#8A6420] dark:text-[#E7C46F]"><PartyPopper className="size-4" />{t('birthdaysToday')}</p>
          <h2 className="mt-1 text-[24px] leading-tight font-semibold tracking-[-0.01em] sm:text-[30px]">
            {t('happyBirthday')}, {names.join(lang_and(names))}!
          </h2>
          <p className="mt-1.5 text-[15px] text-[#6B5428] dark:text-[#D9C59B]">{t(names.length > 1 ? 'birthdayWishMany' : 'birthdayWish')}</p>
        </div>
      </div>
    </section>
  );
}
// "A, B & C" — the ampersand reads the same in both languages
function lang_and(names: string[]) { return names.length > 2 ? ', ' : ' & '; }

function MonthBirthdays({ list, today }: { list: Array<{ name: string; day: number }>; today: string }) {
  const { t, num, month: monthLabel } = useI18n();
  const [y, m, d] = today.split('-').map(Number);
  const monthName = monthLabel({ title_en: new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' }), title_bn: BN_MONTHS[m - 1] });
  return (
    <section aria-labelledby="bday-h" className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="bday-h" className="flex items-center gap-2 text-[17px] font-semibold"><Cake className="size-[18px] text-brass" />{t('birthdaysThisMonth')}</h2>
        <span className="text-[13px] text-ink-3">{monthName}</span>
      </div>
      {list.length === 0 ? (
        <Card className="p-6 text-center text-[14px] text-ink-3">{t('noBirthdaysMonth')}</Card>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b, i) => {
            const isToday = b.day === d;
            const past = b.day < d;
            const away = b.day - d;
            return (
              <li
                key={`${b.name}-${i}`}
                className={cn(
                  'flex items-center gap-3 rounded-[14px] border px-3 py-2.5 transition-colors',
                  isToday ? 'border-[#E0C17F] bg-brass-soft' : 'border-line bg-surface',
                  past && 'opacity-55',
                )}
              >
                <span className={cn('num grid size-11 shrink-0 place-items-center rounded-[11px] text-[17px] font-semibold', isToday ? 'bg-[#C9973F] text-white' : 'bg-sunken text-ink-2')}>
                  {num(b.day)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{b.name}</span>
                <span className={cn('shrink-0 text-[12px]', isToday ? 'font-semibold text-[#8A6420] dark:text-brass' : 'text-ink-3')}>
                  {isToday ? `🎂 ${t('todayLabel')}` : past ? t('passed') : away === 1 ? t('tomorrowCap') : t('daysAway', { n: num(away) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

function Row({ label, value, tone, strong }: { label: string; value: ReactNode; tone?: string; strong?: boolean }) {
  return (
    <div className={cn(strong && 'col-span-2 border-t border-line pt-3')}>
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={cn('num font-semibold', strong ? 'text-[20px]' : 'text-[15px]', tone)}>{value}</dd>
    </div>
  );
}
