import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useCollectorSummaries, useExpenses, useHandovers, useLedger, useMonthStatuses, usePayments, useSettings, useStudentStatuses } from '@/lib/queries';
import { downloadCsv, cn } from '@/lib/utils';
import { pct } from '@/lib/format';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, PageSkeleton, Segmented } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';
import { StudentPicker } from '@/components/domain/StudentPicker';

type Tab = 'monthly' | 'outstanding' | 'collectors' | 'expenses' | 'handovers' | 'student';

export default function Reports() {
  const { t, dateTime } = useI18n();
  const { data: settings } = useSettings();
  const [tab, setTab] = useState<Tab>('monthly');
  const L = useLookups();
  if (L.loading) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title={t('navReports')} actions={<Button variant="secondary" onClick={() => window.print()}><Printer />{t('print')}</Button>} />
      <div className="no-print mb-4">
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'monthly', label: t('reportMonthly') },
          { value: 'outstanding', label: t('reportOutstanding') },
          { value: 'collectors', label: t('reportCollectors') },
          { value: 'expenses', label: t('reportExpenses') },
          { value: 'handovers', label: t('reportHandovers') },
          { value: 'student', label: t('reportStudent') },
        ]} />
      </div>
      <div className="mb-3 hidden print:block">
        <div className="text-[16px] font-semibold">{settings?.app_name} — {settings?.class_name}</div>
        <div className="text-[12px]">{dateTime(new Date().toISOString())}</div>
      </div>
      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'outstanding' && <OutstandingReport />}
      {tab === 'collectors' && <CollectorReport />}
      {tab === 'expenses' && <ExpenseReport />}
      {tab === 'handovers' && <HandoverReport />}
      {tab === 'student' && <StudentReport />}
    </div>
  );
}

function Table({ head, rows, foot, right = [] }: { head: string[]; rows: (React.ReactNode)[][]; foot?: React.ReactNode[]; right?: number[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead className="bg-sunken/60 text-left text-[12px] text-ink-3">
          <tr>{head.map((h, i) => <th key={i} className={cn('px-4 py-2.5 font-medium whitespace-nowrap', right.includes(i) && 'text-right')}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn('px-4 py-2.5', right.includes(j) && 'num text-right')}>{c}</td>)}</tr>)}
        </tbody>
        {foot && <tfoot className="border-t-2 border-line-strong font-semibold"><tr>{foot.map((c, j) => <td key={j} className={cn('px-4 py-2.5', right.includes(j) && 'num text-right')}>{c}</td>)}</tr></tfoot>}
      </table>
    </Card>
  );
}

function CsvBtn({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return <Button variant="secondary" size="sm" className="no-print" onClick={onClick}><Download />{t('exportCsv')}</Button>;
}

function MonthlyReport() {
  const { t, money, month, num } = useI18n();
  const { data } = useLedger();
  const rows = data ?? [];
  if (!rows.length) return <EmptyState title={t('noMonthsYet')} />;
  const sum = (k: 'collected' | 'expenses' | 'other_income' | 'expected' | 'outstanding') => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><CsvBtn onClick={() => downloadCsv('monthly-balance.csv', [
        ['Month', 'Status', 'Opening', 'Expected', 'Collected', 'Cash', 'Digital', 'Other income', 'Approved expenses', 'Outstanding', 'Closing'],
        ...rows.map((r) => [r.title_en, r.status, r.opening_balance, r.expected, r.collected, r.cash_collected, r.digital_collected, r.other_income, r.expenses, r.outstanding, r.closing_balance]),
      ])} /></div>
      <Table
        head={[t('month'), t('openingBalance'), t('expected'), t('collected'), '%', t('otherIncome'), t('totalSpent'), t('remaining'), t('closingBalance')]}
        right={[1, 2, 3, 4, 5, 6, 7, 8]}
        rows={rows.map((r) => [
          <span className="flex items-center gap-2 whitespace-nowrap">{month(r)} <StatusBadge status={r.status} /></span>,
          money(r.opening_balance), money(r.expected), money(r.collected), `${num(pct(r.collected, r.expected))}%`, money(r.other_income), money(r.expenses), money(r.outstanding),
          <b>{money(r.closing_balance)}</b>,
        ])}
        foot={[t('total'), '', money(sum('expected')), money(sum('collected')), '', money(sum('other_income')), money(sum('expenses')), money(sum('outstanding')), money(rows[rows.length - 1].closing_balance)]}
      />
    </div>
  );
}

function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { month, t } = useI18n();
  const L = useLookups();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="no-print w-56" aria-label={t('month')}>
      {L.months.map((m) => <option key={m.id} value={m.id}>{month(m)}</option>)}
    </Select>
  );
}

function OutstandingReport() {
  const { t, money } = useI18n();
  const L = useLookups();
  const [m, setM] = useState(L.months[0]?.id ?? '');
  const { data } = useMonthStatuses(m || undefined);
  const rows = (data ?? []).filter((s) => s.remaining > 0).map((s) => ({ s, st: L.studentById.get(s.student_id) })).filter((x) => x.st)
    .sort((a, b) => a.st!.roll.localeCompare(b.st!.roll, undefined, { numeric: true }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSelect value={m} onChange={setM} />
        <CsvBtn onClick={() => downloadCsv('outstanding.csv', [['Roll', 'Name', 'Phone', 'Collector', 'Expected', 'Paid', 'Remaining'], ...rows.map(({ s, st }) => [st!.roll, st!.name, st!.phone, L.personName(L.collectorOf.get(s.student_id)), s.expected, s.paid, s.remaining])])} />
      </div>
      {rows.length === 0 ? <EmptyState title={t('nothingPending')} /> : (
        <Table head={[t('roll'), t('name'), t('phone'), t('collector'), t('paid'), t('remaining')]} right={[4, 5]}
          rows={rows.map(({ s, st }) => [st!.roll, st!.name, st!.phone ?? '—', L.personName(L.collectorOf.get(s.student_id)), money(s.paid), <b>{money(s.remaining)}</b>])}
          foot={[t('total'), '', '', '', money(rows.reduce((x, r) => x + r.s.paid, 0)), money(rows.reduce((x, r) => x + r.s.remaining, 0))]} />
      )}
    </div>
  );
}

function CollectorReport() {
  const { t, money, num } = useI18n();
  const L = useLookups();
  const [m, setM] = useState(L.months[0]?.id ?? '');
  const { data: summaries } = useCollectorSummaries();
  const { data: statuses } = useMonthStatuses(m || undefined);
  const { data: payments } = usePayments({ monthId: m || undefined, pageSize: 1000 });
  const rows = useMemo(() => {
    const out = (summaries ?? []).map((c) => {
      const mine = (statuses ?? []).filter((s) => L.collectorOf.get(s.student_id) === c.collector_id);
      const collected = (payments?.rows ?? []).filter((p) => p.collected_by === c.collector_id).reduce((x, p) => x + p.amount, 0);
      return { c, assigned: mine.length, expected: mine.reduce((x, s) => x + s.expected, 0), remaining: mine.reduce((x, s) => x + s.remaining, 0), collected };
    });
    return out;
  }, [summaries, statuses, payments, L.collectorOf]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSelect value={m} onChange={setM} />
        <CsvBtn onClick={() => downloadCsv('collectors.csv', [['Collector', 'Assigned', 'Expected', 'Collected this month', 'Remaining', 'Cash in hand', 'Handed over'], ...rows.map((r) => [r.c.full_name, r.assigned, r.expected, r.collected, r.remaining, r.c.cash_in_hand, r.c.handed_confirmed])])} />
      </div>
      {rows.length === 0 ? <EmptyState title={t('noCollectors')} /> : (
        <Table head={[t('collector'), t('assigned'), t('expected'), t('collected'), '%', t('remaining'), t('cashInHand')]} right={[1, 2, 3, 4, 5, 6]}
          rows={rows.map((r) => [r.c.full_name, num(r.assigned), money(r.expected), money(r.collected), `${num(pct(r.expected - r.remaining, r.expected))}%`, money(r.remaining), money(r.c.cash_in_hand)])} />
      )}
    </div>
  );
}

function ExpenseReport() {
  const { t, money, pick, date } = useI18n();
  const L = useLookups();
  const [m, setM] = useState(L.months[0]?.id ?? '');
  const { data } = useExpenses(m || undefined);
  const approved = (data ?? []).filter((e) => e.status === 'approved');
  const byCat = Object.entries(approved.reduce<Record<string, number>>((a, e) => ({ ...a, [e.category_id]: (a[e.category_id] ?? 0) + e.amount }), {}))
    .map(([id, amount]) => ({ c: L.categoryById.get(id), amount })).sort((a, b) => b.amount - a.amount);
  const total = approved.reduce((x, e) => x + e.amount, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSelect value={m} onChange={setM} />
        <CsvBtn onClick={() => downloadCsv('expenses-by-category.csv', [['No', 'Date', 'Title', 'Category', 'Amount', 'Approved by'], ...approved.map((e) => [e.expense_no, e.spent_on, e.title, L.categoryById.get(e.category_id)?.name_en, e.amount, L.personName(e.decided_by)])])} />
      </div>
      {approved.length === 0 ? <EmptyState title={t('noExpensesYet')} /> : (
        <>
          <Table head={[t('category'), t('amount'), '%']} right={[1, 2]} rows={byCat.map((r) => [r.c ? pick(r.c.name_en, r.c.name_bn) : '—', money(r.amount), `${pct(r.amount, total)}%`])} foot={[t('total'), money(total), '100%']} />
          <Table head={[t('date'), t('expenseTitle'), t('category'), t('amount')]} right={[3]} rows={approved.map((e) => [date(e.spent_on), e.title, pick(L.categoryById.get(e.category_id)?.name_en ?? '', L.categoryById.get(e.category_id)?.name_bn ?? ''), money(e.amount)])} />
        </>
      )}
    </div>
  );
}

function HandoverReport() {
  const { t, money, dateTime } = useI18n();
  const L = useLookups();
  const { data } = useHandovers();
  const rows = data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><CsvBtn onClick={() => downloadCsv('handovers.csv', [['No', 'Date', 'Collector', 'Amount', 'Status', 'Received by'], ...rows.map((h) => [h.handover_no, h.handed_at, L.personName(h.collector_id), h.amount, h.status, L.personName(h.received_by)])])} /></div>
      {rows.length === 0 ? <EmptyState title={t('noHandovers')} /> : (
        <Table head={['#', t('date'), t('collector'), t('status'), t('receivedBy'), t('amount')]} right={[5]}
          rows={rows.map((h) => [h.handover_no, dateTime(h.handed_at), L.personName(h.collector_id), <StatusBadge status={h.status} />, L.personName(h.received_by), money(h.amount)])}
          foot={[t('st_confirmed'), '', '', '', '', money(rows.filter((h) => h.status === 'confirmed').reduce((x, h) => x + h.amount, 0))]} />
      )}
    </div>
  );
}

function StudentReport() {
  const { t, money, month, date } = useI18n();
  const L = useLookups();
  const [sid, setSid] = useState('');
  const { data: st } = useStudentStatuses(sid || undefined);
  const { data: pays } = usePayments({ studentId: sid || undefined, pageSize: 500 });
  const s = L.studentById.get(sid);
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="no-print"><StudentPicker students={L.students} value={sid} onChange={setSid} /></div>
      {!s ? <EmptyState title={t('pickStudent')} /> : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">{s.name} <span className="num text-ink-3">· {s.roll}</span></h2>
            <CsvBtn onClick={() => downloadCsv(`student-${s.roll}.csv`, [['Receipt', 'Date', 'Month', 'Amount', 'Method'], ...(pays?.rows ?? []).map((p) => [p.receipt_no, p.paid_on, L.monthById.get(p.month_id)?.title_en, p.amount, p.method])])} />
          </div>
          <Table head={[t('month'), t('expected'), t('paid'), t('waived'), t('remaining'), t('status')]} right={[1, 2, 3, 4]}
            rows={(st ?? []).map((r) => [L.monthById.get(r.month_id) ? month(L.monthById.get(r.month_id)!) : '', money(r.expected), money(r.paid), money(r.waived), money(r.remaining), <StatusBadge status={r.status} />])} />
          <Table head={[t('receiptNo'), t('date'), t('month'), t('method'), t('amount')]} right={[4]}
            rows={(pays?.rows ?? []).map((p) => [p.receipt_no, date(p.paid_on), L.monthById.get(p.month_id) ? month(L.monthById.get(p.month_id)!) : '', t(`method_${p.method}` as StringKey), money(p.amount)])} />
        </div>
      )}
    </div>
  );
}
