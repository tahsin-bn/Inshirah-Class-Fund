import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, BarChart3, Globe, LogIn, Moon, ShieldCheck, Sun, TrendingUp, Wallet } from 'lucide-react';
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
import { ActivityList, CountUp, KitHeader, MonthBirthdayList, MoneyCard, TodayBirthdayCard, WelcomeBanner, percentChange, type ActivityItem } from '@/components/domain/DashboardKit';

// the chart library is heavy, so the public page loads it only when it is needed
const IncomeExpenseArea = lazy(() => import('@/components/charts/Charts').then((m) => ({ default: m.IncomeExpenseArea })));

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

  // "this month" = the latest open month (or the latest month)
  const latest = [...months].reverse().find((m) => m.status === 'open') ?? months[months.length - 1];
  const prev = latest ? months[months.indexOf(latest) - 1] : undefined;
  const inc = latest ? latest.collected + latest.other_income : 0;
  const prevInc = prev ? prev.collected + prev.other_income : undefined;

  const points = months.slice(-12).map((m) => ({
    label: monthLabel(m).replace(/\s\S+$/, '').slice(0, lang === 'en' ? 3 : 12),
    income: m.collected + m.other_income, expenses: m.expenses, balance: m.closing_balance,
  }));

  const activity: ActivityItem[] = useMemo(() => {
    const ins: ActivityItem[] = (data?.recent_collections ?? []).map((c) => ({
      id: `c-${c.day}`, kind: c.amount >= 0 ? 'in' : 'out', label: `${t('collectionOnDay')} · ${date(c.day, false)}`, amount: Math.abs(c.amount), at: c.last_at,
    }));
    const outs: ActivityItem[] = (data?.expenses ?? []).slice(0, 8).map((e) => ({
      id: e.id, kind: 'out', label: `${t('expense')} (${lang === 'bn' ? e.category_bn : e.category_en}) · ${e.title}`, amount: e.amount, at: `${e.spent_on}T12:00:00+06:00`,
    }));
    return [...ins, ...outs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [data, t, date, lang]);

  const bdays = useMemo(() => {
    if (!data?.birthdays_month || !data.today) return null;
    const today = data.today;
    const td = Number(today.slice(8, 10));
    const list = data.birthdays_month.map((b) => ({ ...b, dateLabel: date(`${today.slice(0, 8)}${String(b.day).padStart(2, '0')}`, false) }));
    const up = list.find((b) => b.day > td);
    return { list, td, next: up ? { name: up.name, when: up.dateLabel } : null };
  }, [data, date]);

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

      <main className="mx-auto max-w-[1180px] space-y-5 px-4 pt-5 pb-16 sm:px-6 sm:pt-7">
        {isLoading ? (
          <div className="space-y-4"><Skeleton className="h-40 rounded-[22px]" /><Skeleton className="h-32" /><Skeleton className="h-56" /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data?.enabled ? (
          <p className="pt-20 text-center text-ink-3">{t('publicOff')}</p>
        ) : (
          <>
            <WelcomeBanner title={t('salam')} subtitle={t('publicWelcome', { name: data.class_name })} />

            <div className="grid gap-4 md:grid-cols-3">
              <MoneyCard tone="good" icon={<TrendingUp />} label={t('thisMonthIncome')} value={inc} delta={percentChange(inc, prevInc)} sub={latest ? monthLabel(latest) : undefined} />
              <MoneyCard tone="bad" icon={<ArrowDown />} label={t('thisMonthExpense')} value={latest?.expenses ?? 0} delta={percentChange(latest?.expenses ?? 0, prev?.expenses)} upIsGood={false} sub={latest ? monthLabel(latest) : undefined} />
              <MoneyCard tone="info" icon={<Wallet />} label={t('currentBalance')} value={data.totals?.balance ?? 0} sub={`${t('activeStudents')}: ${num(data.active_students ?? 0)}`} />
            </div>

            {bdays && (
              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <TodayBirthdayCard names={data.birthdays_today ?? []} next={bdays.next} />
                <MonthBirthdayList items={bdays.list} todayDay={bdays.td} />
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              <ActivityList items={activity} />
              <Card>
                <KitHeader icon={<BarChart3 />} title={t('monthlySummary')} action={<Legend />} />
                <CardBody>
                  {points.length ? (
                    <Suspense fallback={<Skeleton className="h-[230px]" />}><IncomeExpenseArea data={points} /></Suspense>
                  ) : <p className="py-10 text-center text-[14px] text-ink-3">{t('noMonthsYet')}</p>}
                </CardBody>
              </Card>
            </div>

            {months.length > 0 && (
              <>
                {/* ---------------- Month ledger strip ---------------- */}
                <section aria-labelledby="ledger-h" className="pt-3">
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
                              className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-violet"
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

            <p className="flex items-start gap-2 pt-3 text-[13px] text-ink-3">
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

function Legend() {
  const { t } = useI18n();
  return (
    <span className="flex shrink-0 items-center gap-3 text-[13px] text-ink-2">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-good" />{t('income')}</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-bad" />{t('expense')}</span>
    </span>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: ReactNode; tone?: string; strong?: boolean }) {
  return (
    <div className={cn(strong && 'col-span-2 border-t border-line pt-3')}>
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={cn('num font-semibold', strong ? 'text-[20px]' : 'text-[15px]', tone)}>{value}</dd>
    </div>
  );
}
