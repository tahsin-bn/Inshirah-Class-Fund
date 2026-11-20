import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, Banknote, BarChart3, CalendarPlus, ChevronRight, Clock, Plus, ReceiptText, Smartphone, TrendingUp, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCollectorSummaries, useExpenses, useHandovers, useLedger, useMonthStatuses, usePayments, useTreasury } from '@/lib/queries';
import { useI18n } from '@/i18n/I18nProvider';
import { daysUntilBirthday, dhakaToday, pct } from '@/lib/format';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageSkeleton, Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { BalanceTrendChart, CategoryBars, IncomeExpenseArea, type MonthPoint } from '@/components/charts/Charts';
import { ActivityList, KitHeader, MonthBirthdayList, MoneyCard, TodayBirthdayCard, WelcomeBanner, percentChange, type ActivityItem } from '@/components/domain/DashboardKit';
import { useLookups } from '@/components/domain/lookups';
import { RecordPaymentDialog } from '@/components/domain/RecordPaymentDialog';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { role } = useAuth();
  return role === 'collector' ? <CollectorDashboard /> : <ManagerDashboard />;
}

function useMonthPoints(): MonthPoint[] {
  const { data } = useLedger();
  const { lang } = useI18n();
  return useMemo(
    () =>
      (data ?? []).slice(-12).map((r) => ({
        label: (lang === 'bn' ? r.title_bn : r.title_en).replace(/\s\S+$/, '').slice(0, lang === 'en' ? 3 : 12),
        income: r.collected + r.other_income,
        expenses: r.expenses,
        balance: r.closing_balance,
      })),
    [data, lang],
  );
}

function Greeting({ action }: { action?: React.ReactNode }) {
  const { profile } = useAuth();
  const { t, date } = useI18n();
  const first = profile?.full_name?.split(' ')[0] || '';
  return (
    <WelcomeBanner
      title={first ? t('salamName', { name: first }) : t('salam')}
      subtitle={<>{t('welcomeSub')}<span className="mt-1 block text-[13px] opacity-75">{date(dhakaToday())}</span></>}
      action={action}
    />
  );
}

/** Birthdays of active students: today's names, this month's list and the next one coming up. */
function useBirthdayData() {
  const L = useLookups();
  const { date } = useI18n();
  return useMemo(() => {
    const today = dhakaToday();
    const [, tm, td] = today.split('-').map(Number);
    const withBday = L.students.filter((s) => s.status === 'active' && s.birthdate);
    const todayNames = withBday.filter((s) => daysUntilBirthday(s.birthdate!) === 0).map((s) => s.name);
    const month = withBday
      .filter((s) => Number(s.birthdate!.slice(5, 7)) === tm)
      .map((s) => {
        const day = Number(s.birthdate!.slice(8, 10));
        return { name: s.name, day, dateLabel: date(`${today.slice(0, 8)}${String(day).padStart(2, '0')}`, false) };
      })
      .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
    const upcoming = withBday.map((s) => ({ s, d: daysUntilBirthday(s.birthdate!) })).filter((x) => x.d > 0).sort((a, b) => a.d - b.d)[0];
    const next = upcoming ? { name: upcoming.s.name, when: date(`${upcoming.s.birthdate!.slice(5) < today.slice(5) ? Number(today.slice(0, 4)) + 1 : today.slice(0, 4)}-${upcoming.s.birthdate!.slice(5)}`, false) } : null;
    return { todayNames, month, next, todayDay: td };
  }, [L.students, date]);
}

function useRecentActivity(): ActivityItem[] {
  const { t, pick } = useI18n();
  const L = useLookups();
  const payments = usePayments({ pageSize: 8 });
  const expenses = useExpenses();
  return useMemo(() => {
    const pay: ActivityItem[] = (payments.data?.rows ?? []).map((p) => ({
      id: p.id,
      kind: p.amount >= 0 ? 'in' : 'out',
      label: `${p.amount >= 0 ? t('income') : t('reversal')} · ${L.studentById.get(p.student_id)?.name ?? ''}`,
      amount: Math.abs(p.amount),
      at: p.created_at,
    }));
    const exp: ActivityItem[] = (expenses.data ?? []).filter((e) => e.status === 'approved').slice(0, 8).map((e) => {
      const c = L.categoryById.get(e.category_id);
      return { id: e.id, kind: 'out', label: `${t('expense')} (${c ? pick(c.name_en, c.name_bn) : e.title}) · ${e.title}`, amount: e.amount, at: e.decided_at ?? e.created_at };
    });
    return [...pay, ...exp].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [payments.data, expenses.data, L.studentById, L.categoryById, t, pick]);
}

function ManagerDashboard() {
  const { t, money, num, month, pick } = useI18n();
  const { can } = useAuth();
  const ledger = useLedger();
  const treasury = useTreasury();
  const expenses = useExpenses();
  const handovers = useHandovers();
  const L = useLookups();
  const points = useMonthPoints();
  const bdays = useBirthdayData();
  const activity = useRecentActivity();
  const [payOpen, setPayOpen] = useState(false);

  if (ledger.isLoading || treasury.isLoading) return <PageSkeleton />;
  if (ledger.error) return <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} />;

  const rows = ledger.data ?? [];
  const cur = [...rows].reverse().find((r) => r.status === 'open') ?? rows[rows.length - 1];
  const prev = cur ? rows[rows.indexOf(cur) - 1] : undefined;
  const tp = treasury.data;
  const pendingExp = (expenses.data ?? []).filter((e) => e.status === 'pending');
  const pendingHand = (handovers.data ?? []).filter((h) => h.status === 'pending');
  const catItems = cur
    ? Object.values(
        (expenses.data ?? [])
          .filter((e) => e.month_id === cur.month_id && e.status === 'approved')
          .reduce<Record<string, { name: string; amount: number }>>((acc, e) => {
            const c = L.categoryById.get(e.category_id);
            const name = c ? pick(c.name_en, c.name_bn) : '—';
            acc[name] = { name, amount: (acc[name]?.amount ?? 0) + e.amount };
            return acc;
          }, {}),
      )
    : [];
  const activeStudents = L.students.filter((s) => s.status === 'active').length;
  const curIncome = cur ? cur.collected + cur.other_income : 0;
  const prevIncome = prev ? prev.collected + prev.other_income : undefined;

  return (
    <div className="space-y-5">
      <Greeting
        action={
          <div className="flex flex-wrap gap-2">
            {can('admin', 'treasurer') && <Button onClick={() => setPayOpen(true)} disabled={!L.openMonths.length}><Plus />{t('recordPayment')}</Button>}
            {can('admin') && !rows.length && <Link to="/app/months"><Button variant="secondary"><CalendarPlus />{t('newMonth')}</Button></Link>}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MoneyCard tone="good" icon={<TrendingUp />} label={t('thisMonthIncome')} value={curIncome} delta={percentChange(curIncome, prevIncome)} sub={cur ? month(cur) : undefined} />
        <MoneyCard tone="bad" icon={<ArrowDown />} label={t('thisMonthExpense')} value={cur?.expenses ?? 0} delta={percentChange(cur?.expenses ?? 0, prev?.expenses)} upIsGood={false} sub={cur ? month(cur) : undefined} />
        <MoneyCard tone="info" icon={<Wallet />} label={t('currentBalance')} value={tp?.balance ?? 0} sub={`${t('cashInTreasury')} ${money(tp?.cash_with_treasury)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <TodayBirthdayCard names={bdays.todayNames} next={bdays.next} />
        <MonthBirthdayList items={bdays.month} todayDay={bdays.todayDay} seeAllTo="/app/birthdays" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <ActivityList items={activity} seeAllTo="/app/payments" />
        <Card>
          <KitHeader
            icon={<BarChart3 />}
            title={t('monthlySummary')}
            action={<Legend />}
          />
          <CardBody>{points.length ? <IncomeExpenseArea data={points} /> : <EmptyState title={t('noMonthsYet')} />}</CardBody>
        </Card>
      </div>

      {/* Everything that was on the dashboard before, kept below the new overview */}
      <h2 className="pt-2 text-[17px] font-bold text-ink">{t('fundDetails')}</h2>

      {!cur ? (
        <Card><EmptyState icon={<CalendarPlus />} title={t('noMonthCta')} action={can('admin') ? <Link to="/app/months"><Button>{t('newMonth')}</Button></Link> : undefined} /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={`${t('expected')} · ${month(cur)}`} value={money(cur.expected)} sub={`${num(cur.students_due)} ${t('navStudents').toLowerCase()}`} />
          <Stat label={t('collected')} value={money(cur.collected)} tone="brand" sub={<Progress value={pct(cur.collected, cur.expected)} className="mt-2" />} />
          <Stat label={t('remaining')} value={money(cur.outstanding)} tone={cur.outstanding > 0 ? 'warn' : 'good'} sub={`${num(cur.unpaid_count)} ${t('st_unpaid')} · ${num(cur.partial_count)} ${t('st_partial')}`} />
          <Stat label={t('totalStudents')} value={num(activeStudents)} sub={`${num(cur.paid_count)} ${t('st_paid')} · ${num(cur.waived_count)} ${t('st_waived')}`} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={t('currentBalance')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <Mini icon={<Banknote />} label={t('cashInTreasury')} value={money(tp?.cash_with_treasury)} />
              <Mini icon={<Users />} label={t('cashWithCollectors')} value={money(tp?.cash_with_collectors)} />
              <Mini icon={<Smartphone />} label={t('digitalBalance')} value={money(tp?.digital_balance)} />
              <Mini icon={<ReceiptText />} label={t('totalSpent')} value={money(tp?.approved_expenses)} />
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('needsAction')} />
          <CardBody className="space-y-2">
            {pendingExp.length === 0 && pendingHand.length === 0 && (
              <p className="py-6 text-center text-[14px] text-ink-3">{t('nothingPending')}</p>
            )}
            {pendingExp.length > 0 && (
              <ActionRow to="/app/expenses" icon={<Clock />} label={t('pendingExpenses')} value={`${num(pendingExp.length)} · ${money(pendingExp.reduce((s, e) => s + e.amount, 0))}`} tone="warn" />
            )}
            {pendingHand.length > 0 && (
              <ActionRow to="/app/handovers" icon={<ArrowLeftRight />} label={t('pendingHandovers')} value={`${num(pendingHand.length)} · ${money(pendingHand.reduce((s, h) => s + h.amount, 0))}`} tone="warn" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('balanceTrend')} />
          <CardBody>{points.length ? <BalanceTrendChart data={points} /> : <EmptyState title={t('noMonthsYet')} />}</CardBody>
        </Card>
        <Card>
          <CardHeader title={t('byCategory')} description={cur ? month(cur) : undefined} />
          <CardBody>{catItems.length ? <CategoryBars items={catItems} /> : <p className="py-6 text-center text-[14px] text-ink-3">{t('noExpensesYet')}</p>}</CardBody>
        </Card>
      </div>

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} />
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

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-sunken p-3">
      <dt className="flex items-center gap-1.5 text-ink-3 [&_svg]:size-3.5">{icon}{label}</dt>
      <dd className="num mt-1 text-[16px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ActionRow({ to, icon, label, value, tone }: { to: string; icon: React.ReactNode; label: string; value: string; tone: 'warn' | 'brass' }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-[10px] border border-line p-3 hover:bg-sunken">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-4', tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-brass-soft text-brass')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="num block truncate text-[13px] text-ink-3">{value}</span>
      </span>
      <ChevronRight className="size-4 text-ink-3" />
    </Link>
  );
}

function CollectorDashboard() {
  const { t, money, num, month } = useI18n();
  const { session } = useAuth();
  const L = useLookups();
  const summaries = useCollectorSummaries();
  const cur = L.latestOpenMonth;
  const statuses = useMonthStatuses(cur?.id);
  const payments = usePayments({ collectorId: session?.user.id, pageSize: 100 });
  const [pay, setPay] = useState<{ open: boolean; student?: string }>({ open: false });

  if (L.loading || summaries.isLoading) return <PageSkeleton />;
  const me = summaries.data?.[0];
  const mine = L.students.filter((s) => L.collectorOf.get(s.id) === session?.user.id && s.status === 'active');
  const statusOf = new Map((statuses.data ?? []).map((s) => [s.student_id, s]));
  const due = mine.reduce((sum, s) => sum + (statusOf.get(s.id)?.remaining ?? 0), 0);
  const today = dhakaToday();
  const todayTotal = (payments.data?.rows ?? []).filter((p) => p.paid_on === today).reduce((s, p) => s + p.amount, 0);
  const sorted = [...mine].sort((a, b) => (statusOf.get(b.id)?.remaining ?? 0) - (statusOf.get(a.id)?.remaining ?? 0));

  return (
    <div className="space-y-5">
      <Greeting />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('cashInHand')} value={money(me?.cash_in_hand)} tone="brand" sub={me?.handed_pending ? `${t('st_pending')}: ${money(me.handed_pending)}` : undefined} />
        <Stat label={t('collectedToday')} value={money(todayTotal)} />
        <Stat label={t('stillDue')} value={money(due)} tone={due > 0 ? 'warn' : 'good'} sub={cur ? month(cur) : undefined} />
        <Stat label={t('myStudents')} value={num(mine.length)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPay({ open: true })} disabled={!cur}><Plus />{t('recordPayment')}</Button>
        <Link to="/app/handovers"><Button variant="secondary"><ArrowLeftRight />{t('handOverCash')}</Button></Link>
      </div>
      <Card>
        <CardHeader title={t('myStudents')} description={cur ? month(cur) : t('noMonthsYet')} />
        {mine.length === 0 ? (
          <EmptyState icon={<Users />} title={t('noStudents')} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {sorted.map((s) => {
              const st = statusOf.get(s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="num w-10 shrink-0 text-[13px] text-ink-3">{s.roll}</span>
                  <Link to={`/app/students/${s.id}`} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:underline">{s.name}</Link>
                  {st && <StatusBadge status={st.status} />}
                  <span className="num hidden w-20 text-right text-[13px] sm:block">{st ? money(st.remaining) : '—'}</span>
                  <Button size="sm" variant={st && st.remaining > 0 ? 'secondary' : 'ghost'} disabled={!st || st.remaining <= 0} onClick={() => setPay({ open: true, student: s.id })}>
                    {t('recordPayment')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <RecordPaymentDialog open={pay.open} onOpenChange={(o) => setPay({ open: o })} studentId={pay.student} monthId={cur?.id} />
    </div>
  );
}
