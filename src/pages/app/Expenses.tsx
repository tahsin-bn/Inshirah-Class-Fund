import { useMemo, useState } from 'react';
import { Ban, Check, Download, FileText, Paperclip, Pencil, Plus, Tags, Wallet, X } from 'lucide-react';
import { BarButton, BulkBar, RowBox, SelectAllBox, exportSelected, useSelection } from '@/components/domain/Bulk';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { rpc, supabase, errorMessage } from '@/lib/supabase';
import { useAction, useExpenses } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { uploadReceipt, receiptUrl } from '@/lib/receipts';
import { dhakaToday } from '@/lib/format';
import { PAYMENT_METHODS, type Expense, type ExpenseStatus, type PaymentMethod } from '@/lib/types';
import { cn, downloadCsv } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, Switch } from '@/components/ui/misc';
import { CategoryBars } from '@/components/charts/CategoryBars';
import { useLookups } from '@/components/domain/lookups';

export default function Expenses() {
  const { t, money, date, month, pick, num } = useI18n();
  const { can, session } = useAuth();
  const L = useLookups();
  const [monthId, setMonthId] = useState('');
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all');
  const [category, setCategory] = useState('');
  const { data, isLoading, error, refetch } = useExpenses(monthId || undefined);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [rejecting, setRejecting] = useState<Expense | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [deficit, setDeficit] = useState<Expense | null>(null);
  const [cats, setCats] = useState(false);

  const approve = useAction(({ e, allow }: { e: Expense; allow: boolean }) => rpc('decide_expense', { p_expense: e.id, p_approve: true, p_allow_deficit: allow }), { success: t('st_approved') });
  const reject = useAction((r: string) => rpc('decide_expense', { p_expense: rejecting!.id, p_approve: false, p_reason: r }), { success: t('st_rejected') });
  const voidE = useAction((r: string) => rpc('void_expense', { p_expense: voiding!.id, p_reason: r }), { success: t('st_void') });

  const all = useMemo(() => data ?? [], [data]);
  const list = all.filter((e) => (status === 'all' || e.status === status) && (!category || e.category_id === category));
  const sum = (s: ExpenseStatus) => all.filter((e) => e.status === s).reduce((x, e) => x + e.amount, 0);
  const byCat = Object.values(
    all.filter((e) => e.status === 'approved').reduce<Record<string, { name: string; amount: number }>>((acc, e) => {
      const c = L.categoryById.get(e.category_id);
      const name = c ? pick(c.name_en, c.name_bn) : '—';
      acc[name] = { name, amount: (acc[name]?.amount ?? 0) + e.amount };
      return acc;
    }, {}),
  );

  const sel = useSelection(list.map((e) => e.id));
  const chosen = list.filter((e) => sel.has(e.id));
  const [bulk, setBulk] = useState<null | 'approve' | 'reject' | 'void' | 'deficit'>(null);
  type BulkRes = { done: number; total: number; skipped: number };
  const decideMany = useAction((a: { approve: boolean; reason?: string; allow?: boolean }) =>
    rpc<BulkRes>('bulk_decide_expenses', { p_ids: sel.selected, p_approve: a.approve, p_reason: a.reason || null, p_allow_deficit: !!a.allow }));
  const voidMany = useAction((reason: string) => rpc<BulkRes>('bulk_void_expenses', { p_ids: sel.selected, p_reason: reason }));
  const bulkDone = (r: BulkRes) => {
    toast.success(t('expensesDone', { n: num(r.done), a: money(r.total) }));
    if (r.skipped) toast.message(t('bulkSkippedN', { n: num(r.skipped) }));
    sel.clear(); setBulk(null);
  };
  const runApprove = async (allow: boolean) => {
    try { bulkDone(await decideMany.mutateAsync({ approve: true, allow })); }
    catch (err) { if (!allow && err instanceof Error && err.message.startsWith('DEFICIT')) setBulk('deficit'); }
  };

  const tryApprove = async (e: Expense) => {
    try {
      await approve.mutateAsync({ e, allow: false });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('DEFICIT')) setDeficit(e);
    }
  };

  if (isLoading || L.loading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('navExpenses')}
        actions={
          <>
            {can('admin') && <Button variant="secondary" onClick={() => setCats(true)}><Tags />{t('categories')}</Button>}
            <Button variant="secondary" onClick={() => downloadCsv('expenses.csv', [
              ['No', 'Date', 'Title', 'Category', 'Month', 'Amount', 'Method', 'Status', 'Submitted by', 'Decided by', 'Reason'],
              ...list.map((e) => [e.expense_no, e.spent_on, e.title, L.categoryById.get(e.category_id)?.name_en, L.monthById.get(e.month_id)?.title_en, e.amount, e.payment_method, e.status, L.personName(e.submitted_by), L.personName(e.decided_by), e.rejection_reason ?? e.void_reason]),
            ])}><Download />{t('exportCsv')}</Button>
            {can('admin', 'treasurer', 'collector') && L.openMonths.length > 0 && (
              <Button onClick={() => setEditing('new')}><Plus />{can('admin', 'treasurer') ? t('newExpense') : t('requestExpense')}</Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('st_approved')} value={money(sum('approved'))} tone="brand" />
        <Stat label={t('st_pending')} value={money(sum('pending'))} tone={sum('pending') ? 'warn' : 'ink'} />
        <Stat label={t('st_rejected')} value={money(sum('rejected'))} />
        <Card className="col-span-2 p-4 lg:col-span-1">
          <div className="text-[13px] text-ink-3">{t('byCategory')}</div>
          {byCat.length ? <CategoryBars items={byCat.slice(0, 3)} className="mt-2 space-y-2" /> : <p className="mt-2 text-[13px] text-ink-3">—</p>}
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'all', label: t('all'), count: all.length },
            { value: 'pending', label: t('st_pending'), count: all.filter((e) => e.status === 'pending').length },
            { value: 'approved', label: t('st_approved'), count: all.filter((e) => e.status === 'approved').length },
            { value: 'rejected', label: t('st_rejected'), count: all.filter((e) => e.status === 'rejected').length },
            { value: 'void', label: t('st_void'), count: all.filter((e) => e.status === 'void').length },
          ]} />
          <div className="grid grid-cols-2 gap-3 lg:ml-auto lg:flex">
            {list.length > 0 && (
              <label className="col-span-2 flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-line px-3 text-[14px] font-medium lg:col-span-1">
                <SelectAllBox s={sel} visible={list.map((e) => e.id)} /> {t('selectAll')}
              </label>
            )}
            <Select value={monthId} onChange={(e) => setMonthId(e.target.value)} aria-label={t('month')}>
              <option value="">{t('month')}: {t('all')}</option>
              {L.months.map((m) => <option key={m.id} value={m.id}>{month(m)}</option>)}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('category')}>
              <option value="">{t('category')}: {t('all')}</option>
              {L.categories.map((c) => <option key={c.id} value={c.id}>{pick(c.name_en, c.name_bn)}</option>)}
            </Select>
          </div>
        </div>
        {list.length === 0 ? <EmptyState icon={<Wallet />} title={all.length ? t('noResults') : t('noExpenses')} /> : (
          <ul className="divide-y divide-line">
            {list.map((e) => {
              const c = L.categoryById.get(e.category_id);
              const m = L.monthById.get(e.month_id);
              const own = e.submitted_by === session?.user.id;
              const open = m?.status === 'open';
              return (
                <li key={e.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap', sel.has(e.id) && 'bg-brand-soft/60')}>
                  <RowBox s={sel} id={e.id} label={e.title} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(e)}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">{e.title}</span>
                      {e.receipt_path && <Paperclip className="size-3.5 shrink-0 text-ink-3" aria-label={t('receipt')} />}
                    </div>
                    <div className="text-[12px] text-ink-3">{c ? pick(c.name_en, c.name_bn) : ''} · {date(e.spent_on)} · {L.personName(e.submitted_by)}</div>
                  </button>
                  <StatusBadge status={e.status} />
                  <span className="num w-24 text-right text-[15px] font-semibold">{money(e.amount)}</span>
                  <div className="flex gap-1">
                    {e.status === 'pending' && open && can('admin', 'treasurer') && !own && (
                      <>
                        <Button size="sm" onClick={() => tryApprove(e)} loading={approve.isPending && approve.variables?.e.id === e.id}><Check />{t('approve')}</Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => setRejecting(e)}><X />{t('reject')}</Button>
                      </>
                    )}
                    {e.status === 'pending' && own && open && can('admin', 'treasurer') && (
                      <span className="hidden max-w-[180px] text-right text-[12px] leading-tight text-warn md:block">{t('needsOtherApprover')}</span>
                    )}
                    {e.status === 'pending' && own && open && <Button size="icon-sm" variant="ghost" aria-label={t('edit')} onClick={() => setEditing(e)}><Pencil /></Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ExpenseDialog expense={editing} onClose={() => setEditing(null)} />
      <ExpenseDetail expense={viewing} onClose={() => setViewing(null)} onVoid={(e) => { setViewing(null); setVoiding(e); }} />
      <BulkBar s={sel} summary={money(chosen.reduce((a, e) => a + e.amount, 0))}>
        <BarButton onClick={() => exportSelected('expenses-selected.csv', chosen, [
          ['No', (e) => e.expense_no], ['Date', (e) => e.spent_on], ['Title', (e) => e.title], ['Category', (e) => L.categoryById.get(e.category_id)?.name_en],
          ['Month', (e) => L.monthById.get(e.month_id)?.title_en], ['Amount', (e) => e.amount], ['Method', (e) => e.payment_method], ['Status', (e) => e.status],
          ['Submitted by', (e) => L.personName(e.submitted_by)], ['Decided by', (e) => L.personName(e.decided_by)], ['Reason', (e) => e.rejection_reason ?? e.void_reason],
        ])}><Download />{t('csvSelected')}</BarButton>
        {can('admin', 'treasurer') && chosen.some((e) => e.status === 'pending') && (
          <>
            <BarButton onClick={() => setBulk('approve')}><Check />{t('approveSelected')}</BarButton>
            <BarButton onClick={() => setBulk('reject')}><X />{t('rejectSelected')}</BarButton>
          </>
        )}
        {can('admin') && <BarButton danger onClick={() => setBulk('void')}><Ban />{t('voidSelected')}</BarButton>}
      </BulkBar>
      <ConfirmDialog open={bulk === 'approve'} onOpenChange={(o) => !o && setBulk(null)} title={t('approveManyTitle', { n: num(sel.count) })} body={t('approveManyBody')}
        confirmLabel={t('approveSelected')} loading={decideMany.isPending} onConfirm={() => runApprove(false)} />
      <ConfirmDialog open={bulk === 'deficit'} onOpenChange={(o) => !o && setBulk(null)} title={t('deficitTitle')} body={t('deficitConfirm')}
        confirmLabel={t('approveDeficit')} danger loading={decideMany.isPending} onConfirm={() => runApprove(true)} />
      <ConfirmDialog open={bulk === 'reject'} onOpenChange={(o) => !o && setBulk(null)} title={t('rejectManyTitle', { n: num(sel.count) })} body={t('approveManyBody')}
        confirmLabel={t('rejectSelected')} reasonLabel={t('rejectReason')} minReason={3} danger loading={decideMany.isPending}
        onConfirm={async (reason) => { try { bulkDone(await decideMany.mutateAsync({ approve: false, reason })); } catch { /* toast shown */ } }} />
      <ConfirmDialog open={bulk === 'void'} onOpenChange={(o) => !o && setBulk(null)} title={t('voidManyTitle', { n: num(sel.count) })} body={t('voidManyBody')}
        confirmLabel={t('voidSelected')} reasonLabel={t('bulkReason')} danger loading={voidMany.isPending}
        onConfirm={async (reason) => { try { bulkDone(await voidMany.mutateAsync(reason)); } catch { /* toast shown */ } }} />

      <ConfirmDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={t('reject')} body={rejecting && <>{rejecting.title} · {money(rejecting.amount)}</>} confirmLabel={t('reject')} reasonLabel={t('rejectReason')} minReason={3} danger loading={reject.isPending}
        onConfirm={async (r) => { await reject.mutateAsync(r).catch(() => {}); setRejecting(null); }} />
      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title={t('voidExpense')} body={voiding && <>{voiding.title} · {money(voiding.amount)}</>} confirmLabel={t('voidExpense')} reasonLabel={t('reason')} danger loading={voidE.isPending}
        onConfirm={async (r) => { await voidE.mutateAsync(r).catch(() => {}); setVoiding(null); }} />
      <ConfirmDialog open={!!deficit} onOpenChange={(o) => !o && setDeficit(null)} title={t('deficitTitle')} body={t('deficitBody')} confirmLabel={t('approveDeficit')} danger loading={approve.isPending}
        onConfirm={async () => { if (deficit) await approve.mutateAsync({ e: deficit, allow: true }).catch(() => {}); setDeficit(null); }} />
      <CategoriesDialog open={cats} onOpenChange={setCats} />
    </div>
  );
}

function ExpenseDialog({ expense, onClose }: { expense: Expense | 'new' | null; onClose: () => void }) {
  const { t, month, pick } = useI18n();
  const { session } = useAuth();
  const L = useLookups();
  const qc = useQueryClient();
  const isNew = expense === 'new';
  const e = expense && expense !== 'new' ? expense : null;
  const [f, setF] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState('');
  const key = isNew ? 'new' : e?.id ?? '';
  if (key !== lastKey) {
    setLastKey(key);
    setFile(null);
    setF({
      title: e?.title ?? '', category_id: e?.category_id ?? L.categories.find((c) => c.is_active)?.id ?? '', month_id: e?.month_id ?? L.latestOpenMonth?.id ?? '',
      amount: e ? String(e.amount) : '', spent_on: e?.spent_on ?? dhakaToday(), description: e?.description ?? '', payment_method: e?.payment_method ?? 'cash',
    });
  }
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  const valid = f.title?.trim().length >= 2 && Number(f.amount) > 0 && f.category_id && f.month_id && f.spent_on;

  const save = async () => {
    setBusy(true);
    try {
      let receipt_path = e?.receipt_path ?? null;
      if (file) receipt_path = await uploadReceipt(file, session!.user.id);
      const payload = {
        title: f.title.trim(), category_id: f.category_id, month_id: f.month_id, amount: Math.round(Number(f.amount)),
        spent_on: f.spent_on, description: f.description.trim() || null, payment_method: f.payment_method as PaymentMethod, receipt_path,
      };
      const { error } = isNew ? await supabase.from('expenses').insert(payload) : await supabase.from('expenses').update(payload).eq('id', e!.id);
      if (error) throw new Error(errorMessage(error));
      toast.success(t('saved'));
      for (const k of ['expenses', 'ledger', 'treasury', 'notifications']) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!expense} onOpenChange={(o) => !o && onClose()} title={isNew ? t('newExpense') : t('edit')}
      description={pick('New expenses wait for approval before they affect the balance.', 'নতুন খরচ অনুমোদনের পরই স্থিতিতে যোগ হবে।')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button disabled={!valid} loading={busy} onClick={save}>{t('save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('expenseTitle')} className="sm:col-span-2"><Input value={f.title ?? ''} onChange={set('title')} placeholder={pick('e.g. Snacks for the seminar', 'যেমন: সেমিনারের নাস্তা')} maxLength={120} /></Field>
        <Field label={t('amount')}><MoneyInput value={f.amount ?? ''} onChange={set('amount')} /></Field>
        <Field label={t('date')}><Input type="date" value={f.spent_on ?? ''} onChange={set('spent_on')} max={dhakaToday()} /></Field>
        <Field label={t('category')}>
          <Select value={f.category_id ?? ''} onChange={set('category_id')}>
            {L.categories.filter((c) => c.is_active || c.id === f.category_id).map((c) => <option key={c.id} value={c.id}>{pick(c.name_en, c.name_bn)}</option>)}
          </Select>
        </Field>
        <Field label={t('month')}>
          <Select value={f.month_id ?? ''} onChange={set('month_id')}>{L.openMonths.map((m) => <option key={m.id} value={m.id}>{month(m)}</option>)}</Select>
        </Field>
        <Field label={t('method')}>
          <Select value={f.payment_method ?? 'cash'} onChange={set('payment_method')}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`method_${m}` as StringKey)}</option>)}</Select>
        </Field>
        <Field label={t('attachReceipt')} hint={file?.name ?? (e?.receipt_path ? '✓' : pick('JPG, PNG or PDF. Photos are compressed.', 'JPG, PNG বা PDF। ছবি ছোট করা হয়।'))}>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-dashed border-line-strong px-3 text-[14px] text-ink-2 hover:bg-sunken">
            <Paperclip className="size-4" /><span className="truncate">{file ? file.name : t('chooseFile').replace('CSV', '')}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
          </label>
        </Field>
        <Field label={<>{t('description')} <span className="text-ink-3">({t('optional')})</span></>} className="sm:col-span-2"><Textarea rows={2} value={f.description ?? ''} onChange={set('description')} maxLength={1000} /></Field>
      </div>
    </Dialog>
  );
}

function ExpenseDetail({ expense: e, onClose, onVoid }: { expense: Expense | null; onClose: () => void; onVoid: (e: Expense) => void }) {
  const { t, money, date, dateTime, month, pick } = useI18n();
  const { can } = useAuth();
  const L = useLookups();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const c = e ? L.categoryById.get(e.category_id) : undefined;
  const m = e ? L.monthById.get(e.month_id) : undefined;
  const openReceipt = async () => {
    if (!e?.receipt_path) return;
    setLoading(true);
    try {
      setUrl(await receiptUrl(e.receipt_path));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={!!e} onOpenChange={(o) => { if (!o) { onClose(); setUrl(null); } }} title={e?.title ?? ''} description={e?.expense_no}
      footer={e && can('admin') && m?.status === 'open' && (e.status === 'approved' || e.status === 'pending') ? <Button variant="danger-ghost" onClick={() => onVoid(e)}>{t('voidExpense')}</Button> : undefined}>
      {e && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="num text-[28px] font-semibold">{money(e.amount)}</span>
            <StatusBadge status={e.status} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[14px]">
            {([
              [t('category'), c ? pick(c.name_en, c.name_bn) : '—'],
              [t('month'), m ? month(m) : '—'],
              [t('date'), date(e.spent_on)],
              [t('method'), t(`method_${e.payment_method}` as StringKey)],
              [t('submittedBy'), `${L.personName(e.submitted_by)} · ${dateTime(e.created_at)}`],
              [t('decidedBy'), e.decided_by ? `${L.personName(e.decided_by)} · ${dateTime(e.decided_at)}` : '—'],
            ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-[12px] text-ink-3">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {e.description && <p className="rounded-[10px] bg-sunken p-3 text-[14px]">{e.description}</p>}
          {(e.rejection_reason || e.void_reason) && <p className="rounded-[10px] bg-bad-soft p-3 text-[14px] text-bad">{t('reason')}: {e.rejection_reason || e.void_reason}</p>}
          {e.receipt_path && (url ? (
            e.receipt_path.endsWith('.pdf') ? (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[14px] font-medium text-brand"><FileText className="size-4" />{t('viewReceipt')}</a>
            ) : (
              <img src={url} alt={t('receipt')} className="max-h-[50vh] w-full rounded-[10px] border border-line object-contain" />
            )
          ) : (
            <Button variant="secondary" onClick={openReceipt} loading={loading}><Paperclip />{t('viewReceipt')}</Button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const L = useLookups();
  const qc = useQueryClient();
  const [en, setEn] = useState('');
  const [bn, setBn] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });
  const add = async () => {
    const { error } = await supabase.from('expense_categories').insert({ name_en: en.trim(), name_bn: bn.trim() || en.trim(), sort_order: L.categories.length + 1 });
    if (error) return toast.error(errorMessage(error));
    setEn(''); setBn(''); refresh();
  };
  const toggle = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from('expense_categories').update({ is_active }).eq('id', id);
    if (error) return toast.error(errorMessage(error));
    refresh();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('categories')}>
      <ul className="divide-y divide-line">
        {L.categories.map((c) => (
          <li key={c.id} className={cn(!c.is_active && 'opacity-60')}>
            <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c.id, v)} label={c.name_en} description={c.name_bn} />
          </li>
        ))}
      </ul>
      <Card className="mt-4">
        <CardHeader title={t('addCategory')} />
        <CardBody className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={en} onChange={(e) => setEn(e.target.value)} placeholder="English" />
          <Input value={bn} onChange={(e) => setBn(e.target.value)} placeholder="বাংলা" />
          <Button disabled={en.trim().length < 2} onClick={add}><Plus />{t('addCategory')}</Button>
        </CardBody>
      </Card>
    </Dialog>
  );
}
