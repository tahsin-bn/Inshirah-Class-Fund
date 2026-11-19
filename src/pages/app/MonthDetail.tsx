import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, HandCoins, Lock, LockOpen, Pencil, Plus, Search } from 'lucide-react';
import { rpc } from '@/lib/supabase';
import { useAction, useLedger, useMonthStatuses, useOtherIncome, useSettings, useWaivers } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { dhakaToday, pct } from '@/lib/format';
import { PAYMENT_METHODS, type DueStatus, type PaymentMethod } from '@/lib/types';
import { downloadCsv } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card, CardHeader, Stat } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Progress, Segmented } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { useLookups } from '@/components/domain/lookups';
import { RecordPaymentDialog } from '@/components/domain/RecordPaymentDialog';

export default function MonthDetail() {
  const { id } = useParams();
  const { t, money, month, date, pick } = useI18n();
  const { can, role, session } = useAuth();
  const L = useLookups();
  const ledger = useLedger();
  const statuses = useMonthStatuses(id);
  const waivers = useWaivers(id);
  const { data: settings } = useSettings();
  const [filter, setFilter] = useState<'all' | DueStatus>('all');
  const [q, setQ] = useState('');
  const [pay, setPay] = useState<{ open: boolean; student?: string }>({ open: false });
  const [waive, setWaive] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const row = ledger.data?.find((r) => r.month_id === id);
  const fm = id ? L.monthById.get(id) : undefined;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (statuses.data ?? [])
      .map((st) => ({ st, student: L.studentById.get(st.student_id) }))
      .filter((x) => x.student)
      .filter((x) => filter === 'all' || x.st.status === filter)
      .filter((x) => !s || x.student!.name.toLowerCase().includes(s) || x.student!.roll.toLowerCase().includes(s))
      .sort((a, b) => a.student!.roll.localeCompare(b.student!.roll, undefined, { numeric: true }));
  }, [statuses.data, L.studentById, filter, q]);

  const counts = useMemo(() => {
    const c = { all: 0, paid: 0, partial: 0, unpaid: 0, waived: 0 } as Record<string, number>;
    for (const s of statuses.data ?? []) { c.all++; c[s.status]++; }
    return c;
  }, [statuses.data]);

  const close = useAction((r: string) => rpc('close_fund_month', { p_id: id, p_reason: r || null }), { success: t('saved'), extraKeys: ['months'] });
  const reopen = useAction((r: string) => rpc('reopen_fund_month', { p_id: id, p_reason: r }), { success: t('saved'), extraKeys: ['months'] });
  const revokeW = useAction((r: string) => rpc('revoke_waiver', { p_waiver: revoke, p_reason: r }), { success: t('saved') });

  if (ledger.isLoading || L.loading) return <PageSkeleton />;
  if (ledger.error) return <ErrorState error={ledger.error} />;
  if (!row || !fm) return <EmptyState title={t('noResults')} action={<Link to="/app/months"><Button variant="secondary">{t('navMonths')}</Button></Link>} />;

  const isOpen = row.status === 'open';
  const canPay = isOpen && can('admin', 'treasurer', 'collector');
  const waiverOf = new Map((waivers.data ?? []).map((w) => [w.student_id, w]));

  const exportCsv = () =>
    downloadCsv(`dues-${row.year}-${String(row.month).padStart(2, '0')}.csv`, [
      ['Roll', 'Name', 'Collector', 'Expected', 'Paid', 'Waived', 'Remaining', 'Status'],
      ...list.map(({ st, student }) => [student!.roll, student!.name, L.personName(L.collectorOf.get(st.student_id)), st.expected, st.paid, st.waived, st.remaining, st.status]),
    ]);

  return (
    <div className="space-y-5">
      <Link to="/app/months" className="no-print inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />{t('navMonths')}</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{month(row)} <StatusBadge status={row.status} /></span>}
        description={
          <>
            {money(row.contribution_amount)} {t('perStudent')}
            {row.special_amount > 0 && <> + {money(row.special_amount)} {row.special_label ? `(${row.special_label})` : ''}</>}
            {row.deadline && <> · {t('deadline')}: {date(row.deadline)}</>}
          </>
        }
        actions={
          <>
            {canPay && <Button onClick={() => setPay({ open: true })}><Plus />{t('recordPayment')}</Button>}
            {can('admin') && isOpen && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil />{t('editMonth')}</Button>}
            {can('admin') && isOpen && <Button variant="secondary" onClick={() => setClosing(true)}><Lock />{t('closeMonth')}</Button>}
            {can('admin') && !isOpen && <Button variant="secondary" onClick={() => setReopening(true)}><LockOpen />{t('reopenMonth')}</Button>}
          </>
        }
      />

      {!isOpen && (
        <div className="flex items-center gap-2 rounded-[10px] bg-sunken px-4 py-3 text-[14px] text-ink-2"><Lock className="size-4" />{t('monthClosedBanner')}</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t('openingBalance')} value={money(row.opening_balance)} />
        <Stat label={t('collected')} value={money(row.collected)} tone="brand" sub={<Progress value={pct(row.collected, row.expected)} className="mt-2" />} />
        <Stat label={t('remaining')} value={money(row.outstanding)} tone={row.outstanding ? 'warn' : 'good'} sub={`${t('expected')} ${money(row.expected)}`} />
        <Stat label={t('totalSpent')} value={money(row.expenses)} sub={row.pending_expenses ? `${t('st_pending')}: ${money(row.pending_expenses)}` : undefined} />
        <Stat label={t('closingBalance')} value={money(row.closing_balance)} tone={row.closing_balance < 0 ? 'bad' : 'ink'} className="col-span-2 lg:col-span-1" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('all'), count: counts.all },
              { value: 'unpaid', label: t('st_unpaid'), count: counts.unpaid },
              { value: 'partial', label: t('st_partial'), count: counts.partial },
              { value: 'paid', label: t('st_paid'), count: counts.paid },
              { value: 'waived', label: t('st_waived'), count: counts.waived },
            ]}
          />
          <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pickStudent')} className="pl-9" />
          </div>
          <Button variant="ghost" size="sm" onClick={exportCsv}><Download />{t('exportCsv')}</Button>
        </div>

        {list.length === 0 ? (
          <EmptyState title={statuses.isLoading ? t('loading') : role === 'collector' ? t('noStudents') : t('noResults')} />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[14px]">
                <thead className="bg-sunken/60 text-left text-[12px] text-ink-3">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">{t('roll')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('name')}</th>
                    {role !== 'collector' && <th className="px-4 py-2.5 font-medium">{t('collector')}</th>}
                    <th className="px-4 py-2.5 text-right font-medium">{t('paid')}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t('remaining')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map(({ st, student }) => {
                    const w = waiverOf.get(st.student_id);
                    const mine = role !== 'collector' || L.collectorOf.get(st.student_id) === session?.user.id;
                    return (
                      <tr key={st.student_id} className="hover:bg-sunken/40">
                        <td className="num px-4 py-2.5 text-ink-3">{student!.roll}</td>
                        <td className="px-4 py-2.5"><Link to={`/app/students/${student!.id}`} className="font-medium hover:underline">{student!.name}</Link></td>
                        {role !== 'collector' && <td className="px-4 py-2.5 text-ink-2">{L.collectorOf.get(st.student_id) ? L.personName(L.collectorOf.get(st.student_id)) : <span className="text-ink-3">{t('unassigned')}</span>}</td>}
                        <td className="num px-4 py-2.5 text-right">{money(st.paid)}{st.waived > 0 && <span className="block text-[12px] text-info">+{money(st.waived)} {t('waived')}</span>}</td>
                        <td className="num px-4 py-2.5 text-right font-medium">{money(st.remaining)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={st.status} /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            {canPay && mine && st.remaining > 0 && <Button size="sm" onClick={() => setPay({ open: true, student: st.student_id })}>{t('recordPayment')}</Button>}
                            {isOpen && can('admin', 'treasurer') && !w && st.remaining > 0 && <Button size="sm" variant="ghost" onClick={() => setWaive(st.student_id)}><HandCoins />{t('grantWaiver')}</Button>}
                            {isOpen && can('admin', 'treasurer') && w && <Button size="sm" variant="danger-ghost" onClick={() => setRevoke(w.id)}>{t('revokeWaiver')}</Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {list.map(({ st, student }) => (
                <li key={st.student_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/students/${student!.id}`} className="block truncate text-[14px] font-medium">{student!.name}</Link>
                    <div className="num text-[12px] text-ink-3">{t('roll')} {student!.roll} · {t('remaining')} {money(st.remaining)}</div>
                  </div>
                  <StatusBadge status={st.status} />
                  {canPay && st.remaining > 0 && (role !== 'collector' || L.collectorOf.get(st.student_id) === session?.user.id) && (
                    <Button size="icon-sm" aria-label={t('recordPayment')} onClick={() => setPay({ open: true, student: st.student_id })}><Plus /></Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {settings?.other_income_enabled && can('admin', 'treasurer', 'auditor') && <OtherIncomeCard monthId={row.month_id} open={isOpen} />}

      <RecordPaymentDialog open={pay.open} onOpenChange={(o) => setPay({ open: o })} monthId={id} studentId={pay.student} />
      <WaiverDialog studentId={waive} monthId={id!} onClose={() => setWaive(null)} remaining={statuses.data?.find((s) => s.student_id === waive)?.remaining ?? 0} />
      <EditMonthDialog open={edit} onOpenChange={setEdit} month={fm} />
      <ConfirmDialog open={closing} onOpenChange={setClosing} title={t('closeMonth')} body={t('closeMonthBody')} confirmLabel={t('closeMonth')} loading={close.isPending}
        onConfirm={async (r) => { await close.mutateAsync(r).catch(() => {}); setClosing(false); }} />
      <ConfirmDialog open={reopening} onOpenChange={setReopening} title={t('reopenMonth')} confirmLabel={t('reopenMonth')} reasonLabel={t('reason')} loading={reopen.isPending}
        body={pick('Reopening lets people change this month’s records again. The reason is saved in the audit log.', 'মাস পুনরায় খুললে এর হিসাব আবার পরিবর্তন করা যাবে। কারণটি অডিট লগে থাকবে।')}
        onConfirm={async (r) => { await reopen.mutateAsync(r).catch(() => {}); setReopening(false); }} />
      <ConfirmDialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)} title={t('revokeWaiver')} confirmLabel={t('revokeWaiver')} reasonLabel={t('reason')} danger loading={revokeW.isPending}
        onConfirm={async (r) => { await revokeW.mutateAsync(r).catch(() => {}); setRevoke(null); }} />
    </div>
  );
}

function WaiverDialog({ studentId, monthId, onClose, remaining }: { studentId: string | null; monthId: string; onClose: () => void; remaining: number }) {
  const { t, money } = useI18n();
  const L = useLookups();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const save = useAction(() => rpc('grant_waiver', { p_student: studentId, p_month: monthId, p_amount: Number(amount), p_reason: reason }), { success: t('saved') });
  const valid = Number(amount) > 0 && Number(amount) <= remaining && reason.trim().length >= 3;
  return (
    <Dialog
      open={!!studentId}
      onOpenChange={(o) => { if (!o) { onClose(); setAmount(''); setReason(''); } }}
      title={t('grantWaiver')}
      description={studentId ? `${L.studentById.get(studentId)?.name} · ${t('remainingDue', { a: money(remaining) })}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button disabled={!valid} loading={save.isPending} onClick={async () => { await save.mutateAsync(undefined).catch(() => {}); onClose(); setAmount(''); setReason(''); }}>{t('grantWaiver')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('amount')}>
          <div className="flex gap-2">
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} max={remaining} />
            <Button variant="secondary" onClick={() => setAmount(String(remaining))}>{t('payFull')}</Button>
          </div>
        </Field>
        <Field label={t('reason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
      </div>
    </Dialog>
  );
}

function EditMonthDialog({ open, onOpenChange, month: m }: { open: boolean; onOpenChange: (o: boolean) => void; month: import('@/lib/types').FundMonth }) {
  const { t, pick } = useI18n();
  const [c, setC] = useState(String(m.contribution_amount));
  const [sp, setSp] = useState(String(m.special_amount));
  const [label, setLabel] = useState(m.special_label ?? '');
  const [deadline, setDeadline] = useState(m.deadline ?? '');
  const [notes, setNotes] = useState(m.notes ?? '');
  const [reason, setReason] = useState('');
  const save = useAction(
    () => rpc('update_fund_month', { p_id: m.id, p_contribution: Number(c), p_special: Number(sp), p_special_label: label || null, p_deadline: deadline || null, p_notes: notes || null, p_reason: reason || null }),
    { success: t('saved'), extraKeys: ['months'] },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editMonth')}
      description={pick('Changing the amount changes what every student owes this month.', 'পরিমাণ বদলালে এই মাসে সবার বকেয়া বদলাবে।')}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button><Button loading={save.isPending} onClick={async () => { await save.mutateAsync(undefined).catch(() => {}); onOpenChange(false); }}>{t('saveChanges')}</Button></>}
    >
      <div className="space-y-4">
        <Field label={t('contribution')}><MoneyInput value={c} onChange={(e) => setC(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('specialAmount')}><MoneyInput value={sp} onChange={(e) => setSp(e.target.value)} /></Field>
          <Field label={t('specialLabel')}><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        </div>
        <Field label={t('deadline')}><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label={t('note')}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Field label={<>{t('reason')} <span className="text-ink-3">({t('optional')})</span></>}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function OtherIncomeCard({ monthId, open }: { monthId: string; open: boolean }) {
  const { t, money, date } = useI18n();
  const { can } = useAuth();
  const { data } = useOtherIncome(monthId);
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [f, setF] = useState({ source: '', amount: '', received_on: dhakaToday(), method: 'cash' as PaymentMethod, note: '' });
  const add = useAction(() => rpc('add_other_income', { p_month: monthId, p_source: f.source, p_amount: Number(f.amount), p_received_on: f.received_on, p_method: f.method, p_note: f.note || null }), { success: t('saved') });
  const voidI = useAction((r: string) => rpc('void_other_income', { p_id: voiding, p_reason: r }), { success: t('saved') });
  const rows = (data ?? []).filter((r) => !r.voided_at);
  return (
    <Card>
      <CardHeader title={t('otherIncome')} action={open && can('admin', 'treasurer') ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus />{t('addOtherIncome')}</Button> : undefined} />
      {rows.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink-3">{t('none')}</p> : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[14px]">
              <div className="flex-1"><div className="font-medium">{r.source}</div><div className="text-[12px] text-ink-3">{date(r.received_on)} · {t(`method_${r.method}` as StringKey)}</div></div>
              <span className="num font-semibold">{money(r.amount)}</span>
              {open && can('admin', 'treasurer') && <Button size="sm" variant="danger-ghost" onClick={() => setVoiding(r.id)}>{t('reject')}</Button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={adding} onOpenChange={setAdding} title={t('addOtherIncome')} size="sm"
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>{t('cancel')}</Button><Button loading={add.isPending} disabled={!f.source.trim() || !(Number(f.amount) > 0)} onClick={async () => { await add.mutateAsync(undefined).catch(() => {}); setAdding(false); }}>{t('save')}</Button></>}>
        <div className="space-y-4">
          <Field label={t('source')}><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Donation, fine…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('amount')}><MoneyInput value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label={t('date')}><Input type="date" value={f.received_on} max={dhakaToday()} onChange={(e) => setF({ ...f, received_on: e.target.value })} /></Field>
          </div>
          <Field label={t('method')}><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`method_${m}` as StringKey)}</option>)}</Select></Field>
          <Field label={t('note')}><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
      </Dialog>
      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title={t('reject')} confirmLabel={t('confirm')} reasonLabel={t('reason')} danger loading={voidI.isPending}
        onConfirm={async (r) => { await voidI.mutateAsync(r).catch(() => {}); setVoiding(null); }} />
    </Card>
  );
}
