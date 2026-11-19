import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cake, Globe, LogIn, Moon, ShieldCheck, Sun } from 'lucide-react';
import { usePublicDashboard } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { pct } from '@/lib/format';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorState, Progress, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { CategoryBars } from '@/components/charts/CategoryBars';

export default function PublicDashboard() {
  const { t, lang, setLang, money, num, date, month: monthLabel, pick, dateTime } = useI18n();
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

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo small />
            <span className="text-[15px] font-semibold">{data?.app_name ?? t('appName')}</span>
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
          <div className="space-y-4 pt-10"><Skeleton className="h-10 w-72" /><Skeleton className="h-20 w-96" /><Skeleton className="h-56" /></div>
        ) : error ? (
          <div className="pt-10"><ErrorState error={error} onRetry={() => refetch()} /></div>
        ) : !data?.enabled ? (
          <p className="pt-20 text-center text-ink-3">{t('publicOff')}</p>
        ) : (
          <>
            {/* Hero: the balance and the ledger strip */}
            <section className="pt-10 pb-8 sm:pt-14">
              <p className="text-[14px] text-ink-3">{data.class_name}</p>
              <h1 className="mt-1 text-[15px] font-medium text-ink-2">{t('publicBalance')}</h1>
              <div className={cn('num mt-1 text-[52px] leading-none font-semibold tracking-[-0.03em] sm:text-[76px]', (data.totals?.balance ?? 0) < 0 ? 'text-bad' : 'text-ink')}>
                {money(data.totals?.balance)}
              </div>
              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
                <div><dt className="text-ink-3">{t('totalCollected')}</dt><dd className="num font-semibold text-brand">{money(data.totals?.collected)}</dd></div>
                <div><dt className="text-ink-3">{t('totalSpent')}</dt><dd className="num font-semibold text-brass">{money(data.totals?.expenses)}</dd></div>
                {!!data.totals?.other_income && <div><dt className="text-ink-3">{t('otherIncome')}</dt><dd className="num font-semibold">{money(data.totals.other_income)}</dd></div>}
                {!!data.totals?.opening_balance && <div><dt className="text-ink-3">{t('openingBalance')}</dt><dd className="num font-semibold">{money(data.totals.opening_balance)}</dd></div>}
              </dl>
            </section>

            {months.length === 0 ? (
              <Card className="p-8 text-center text-ink-3">{t('noMonthsYet')}</Card>
            ) : (
              <>
                <section aria-labelledby="ledger-h" className="mb-8">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 id="ledger-h" className="text-[17px] font-semibold">{t('publicLedger')}</h2>
                    <p className="hidden text-[13px] text-ink-3 sm:block">{t('publicLedgerHint')}</p>
                  </div>
                  <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                    <div className="flex min-w-max items-end gap-2" role="listbox" aria-label={t('publicLedger')}>
                      {months.map((m) => {
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
                              className={cn('block w-full origin-bottom rounded-[6px] animate-[rise_600ms_cubic-bezier(.2,.8,.2,1)_both]', m.closing_balance < 0 ? 'bg-bad/70' : active ? 'bg-brand' : 'bg-brand/35 group-hover:bg-brand/55')}
                              style={{ height: h }}
                            />
                            <span className={cn('text-[12px]', active ? 'font-semibold text-ink' : 'text-ink-3')}>{monthLabel(m).replace(/\s\S+$/, '')}</span>
                            <span className="num -mt-1 text-[11px] text-ink-3">{num(m.year)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

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
                            <span className="num font-medium">{num(pct(current.collected, current.expected))}%</span>
                          </div>
                          <Progress value={pct(current.collected, current.expected)} />
                          <p className="mt-2 text-[13px] text-ink-3">{t('studentsPaid', { n: current.paid_count + current.waived_count, m: current.students_due })}</p>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
                          <Row label={t('openingBalance')} value={money(current.opening_balance)} />
                          <Row label={t('expected')} value={money(current.expected)} />
                          <Row label={t('collected')} value={money(current.collected)} tone="text-brand" />
                          <Row label={t('approvedSpending')} value={money(current.expenses)} tone="text-brass" />
                          {current.other_income > 0 && <Row label={t('otherIncome')} value={money(current.other_income)} />}
                          <Row label={t('closingBalance')} value={money(current.closing_balance)} strong />
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

            {data.birthdays_today && data.birthdays_today.length > 0 && (
              <Card className="mt-4 flex items-center gap-4 border-brass/40 bg-brass-soft p-5">
                <Cake className="size-6 shrink-0 text-brass" />
                <div>
                  <div className="text-[13px] text-ink-3">{t('birthdaysToday')}</div>
                  <div className="text-[15px] font-semibold">{data.birthdays_today.join(', ')}</div>
                </div>
              </Card>
            )}

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

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className={cn(strong && 'col-span-2 border-t border-line pt-3')}>
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={cn('num font-semibold', strong ? 'text-[20px]' : 'text-[15px]', tone)}>{value}</dd>
    </div>
  );
}
