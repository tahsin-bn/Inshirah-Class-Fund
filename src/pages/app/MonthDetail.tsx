import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCheck, Download, HandCoins, Lock, LockOpen, Pencil, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { rpc } from '@/lib/supabase';
import { useAction, useLedger, useMonthStatuses, useOtherIncome, useSettings, useWaivers } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { dhakaToday, pct } from '@/lib/format';
import { PAYMENT_METHODS, type DueStatus, type PaymentMethod } from '@/lib/types';
import { cn, downloadCsv, uuid } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card, CardHeader, Stat } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { Checkbox, EmptyState, ErrorState, PageHeader, PageSkeleton, Progress, Segmented } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { useLookups } from '@/components/domain/lookups';
import { RecordPaymentDialog } from '@/components/domain/RecordPaymentDialog';

export default function MonthDetail() {
  const { id } = useParams();
  const { t, money, num, month, date, pick } = useI18n();
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
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

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
  // bulk collection is for the main admin only (also enforced in the database)
  const canBulk = isOpen && can('admin');
  const remainingOf = new Map((statuses.data ?? []).map((s) => [s.student_id, s.remaining]));
  const allDueIds = (statuses.data ?? []).filter((s) => s.remaining > 0 && L.studentById.get(s.student_id)?.status === 'active').map((s) => s.student_id);
  const visibleDueIds = list.filter((x) => x.st.remaining > 0 && x.student!.status === 'active').map((x) => x.st.student_id);
  const selIds = [...sel].filter((id) => (remainingOf.get(id) ?? 0) > 0);
  const selTotal = selIds.reduce((a, id) => a + (remainingOf.get(id) ?? 0), 0);
  const visibleSelected = visibleDueIds.filter((id) => sel.has(id)).length;
  const headerState: boolean | 'indeterminate' = visibleSelected === 0 ? false : visibleSelected === visibleDueIds.length ? true : 'indeterminate';
  const toggle = (id: string, on: boolean) => setSel((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  const toggleVisible = (on: boolean) => setSel((prev) => { const n = new Set(prev); for (const id of visibleDueIds) { if (on) n.add(id); else n.delete(id); } return n; });
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
            {canBulk && allDueIds.length > 0 && <Button variant="secondary" onClick={() => setSel(new Set(allDueIds))}><CheckCheck />{t('bulkSelectAllDue')}</Button>}
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
                    {canBulk && (
                      <th className="w-10 py-2.5 pl-4">
                        {visibleDueIds.length > 0 && <Checkbox checked={headerState} onCheckedChange={toggleVisible} label={t('bulkSelectAllDue')} />}
                      </th>
                    )}
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
                      <tr key={st.student_id} className={cn('hover:bg-sunken/40', sel.has(st.student_id) && 'bg-brand-soft/60 hover:bg-brand-soft')}>
                        {canBulk && (
                          <td className="w-10 py-2.5 pl-4">
                            {st.remaining > 0 && <Checkbox checked={sel.has(st.student_id)} onCheckedChange={(v) => toggle(st.student_id, v)} label={t('selectStudent', { name: student!.name })} />}
                          </td>
                        )}
                        <td className="num px-4 py-2.5 text-ink-3">{student!.roll}</td>
                        <td className="px-4 py-2.5"><Link to={`/app/students/${student!.id}`} className="font-medium hover:underline">{student!.name}</Link></td>
                        {role !== 'collector' && <td className="px-4 py-2.5 text-ink-2">{L.collectorOf.get(st.student_id) ? L.personName(L.collectorOf.get(st.student_id)) : <span className="text-ink-3">{t('unassigned')}</span>}</td>}
                        <td className="num px-4 py-2.5 text-right">{money(st.paid)}{st.waived > 0 && <span className="block text-[12px] text-info">+{money(st.waived)} {t('waived')}</span>}</td>
                        <td className="num px-4 py-2.5 text-right font-medium">{money(st.remaining)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={st.status} /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            {canPay && mine && st.remaining > 0 && <Button size="sm" variant="secondary" onClick={() => setPay({ open: true, student: st.student_id })}>{t('recordPayment')}</Button>}
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
                <li key={st.student_id} className={cn('flex items-center gap-3 px-4 py-3', sel.has(st.student_id) && 'bg-brand-soft/60')}>
                  {canBulk && (
                    <span className="grid w-5 place-items-center">
                      {st.remaining > 0 && <Checkbox checked={sel.has(st.student_id)} onCheckedChange={(v) => toggle(st.student_id, v)} label={t('selectStudent', { name: student!.name })} />}
                    </span>
                  )}
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

      {canBulk && selIds.length > 0 && (
        <div className="sticky bottom-[76px] z-20 md:bottom-4">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-[14px] border border-line bg-ink px-4 py-3 text-paper shadow-[0_12px_32px_-12px_rgba(0,0,0,.45)] dark:bg-surface dark:text-ink">
            <div className="min-w-0 flex-1 text-[14px]">
              <span className="num font-semibold">{t('bulkSelected', { n: num(selIds.length), a: money(selTotal) })}</span>
            </div>
            <Button size="icon-sm" variant="ghost" className="text-current hover:bg-white/10" aria-label={t('bulkClear')} onClick={() => setSel(new Set())}><X /></Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}><CheckCheck />{t('bulkCollect')}</Button>
          </div>
        </div>
      )}
      {canBulk && (
        <BulkCollectDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          monthId={row.month_id}
          ids={selIds}
          total={selTotal}
          onDone={() => { setSel(new Set()); setBulkOpen(false); }}
        />
      )}

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

function BulkCollectDialog({ open, onOpenChange, monthId, ids, total, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; monthId: string; ids: string[]; total: number; onDone: () => void;
}) {
  const { t, money, num } = useI18n();
  const L = useLookups();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidOn, setPaidOn] = useState(dhakaToday());
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  // one request id per opening, so a double click can never record twice
  const [clientRef, setClientRef] = useState(uuid());
  const save = useAction(
    () => rpc<{ count: number; total: number; skipped: number; already_recorded: number }>('record_bulk_payments', {
      p_month: monthId, p_students: ids, p_method: method, p_paid_on: paidOn, p_client_ref: clientRef,
      p_transaction_ref: ref.trim() || null, p_note: note.trim() || null,
    }),
  );
  const needsRef = method !== 'cash';
  const valid = ids.length > 0 && (!needsRef || ref.trim().length > 0) && paidOn <= dhakaToday();
  const names = ids.map((id) => L.studentById.get(id)?.name).filter(Boolean) as string[];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (o) setClientRef(uuid()); }}
      title={t('bulkTitle', { n: num(ids.length) })}
      description={t('bulkBody')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button disabled={!valid} loading={save.isPending} onClick={async () => {
            try {
              const r = await save.mutateAsync(undefined);
              toast.success(t('bulkDone', { n: num(r.count + r.already_recorded), a: money(r.total) }));
              if (r.skipped) toast.message(t('bulkSkipped', { n: num(r.skipped) }));
              setRef(''); setNote('');
              onDone();
            } catch { /* toast already shown */ }
          }}>{t('bulkConfirm', { n: num(ids.length) })}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[12px] bg-brand-soft px-4 py-3">
          <div className="text-[13px] text-ink-2">{t('bulkTotal')}</div>
          <div className="num text-[26px] font-semibold text-brand">{money(total)}</div>
          <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">{names.slice(0, 6).join(', ')}{names.length > 6 ? ` +${num(names.length - 6)}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('method')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`method_${m}` as StringKey)}</option>)}
            </Select>
          </Field>
          <Field label={t('date')}><Input type="date" value={paidOn} max={dhakaToday()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        </div>
        {needsRef && <Field label={t('txRef')} hint={t('txRefHint')}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
        <Field label={<>{t('note')} <span className="text-ink-3">({t('optional')})</span></>}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
