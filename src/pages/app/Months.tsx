import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, ChevronRight, Download, Lock, LockOpen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { rpc } from '@/lib/supabase';
import { useAction, useLedger } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { dhakaNowParts, monthName, pct } from '@/lib/format';
import { useI18n } from '@/i18n/I18nProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/dialog';
import { BarButton, BulkBar, RowBox, SelectAllBox, exportSelected, useSelection } from '@/components/domain/Bulk';
import type { LedgerRow } from '@/lib/types';

export default function Months() {
  const { t, money, num, month, date } = useI18n();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useLedger();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'close' | 'reopen'>(null);
  const rows = [...(data ?? [])].reverse();
  const isAdmin = can('admin');
  const s = useSelection(isAdmin ? rows.map((r) => r.month_id) : []);
  const chosen = rows.filter((r) => s.has(r.month_id));

  const del = useAction((reason: string) => rpc<{ deleted: number; skipped: number }>('bulk_delete_months', { p_ids: s.selected, p_reason: reason }), { extraKeys: ['months'] });
  const setStatus = useAction(
    (a: { close: boolean; reason: string }) => rpc<{ done: number; skipped: number }>('bulk_set_months_status', { p_ids: s.selected, p_close: a.close, p_reason: a.reason || null }),
    { extraKeys: ['months'] },
  );
  const skipped = (n: number) => { if (n) toast.message(t('bulkSkippedN', { n: num(n) })); };

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title={t('navMonths')}
        description={t('publicLedgerHint')}
        actions={
          isAdmin && (
            <>
              {rows.length > 0 && (
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[14px] font-medium">
                  <SelectAllBox s={s} visible={rows.map((r) => r.month_id)} /> {t('selectAll')}
                </label>
              )}
              <Button onClick={() => setOpen(true)}><CalendarPlus />{t('newMonth')}</Button>
            </>
          )
        }
      />
      {rows.length === 0 ? (
        <Card><EmptyState icon={<CalendarPlus />} title={t('noMonthCta')} action={can('admin') ? <Button onClick={() => setOpen(true)}>{t('newMonth')}</Button> : undefined} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Link key={r.month_id} to={`/app/months/${r.month_id}`} className="group">
              <Card className={cn('h-full p-5 transition-colors group-hover:border-line-strong', r.status === 'open' && 'ring-1 ring-brand/20', s.has(r.month_id) && 'border-brand bg-brand-soft/40 ring-2 ring-brand/40')}>
                <div className="flex items-start justify-between gap-2">
                  {isAdmin && <span className="pt-1"><RowBox s={s} id={r.month_id} label={month(r)} /></span>}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-semibold">{month(r)}</h2>
                    <p className="num text-[13px] text-ink-3">
                      {money(r.contribution_amount + r.special_amount)} {t('perStudent')}
                      {r.deadline && <> · {t('deadline')}: {date(r.deadline, false)}</>}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="num">{money(r.collected)} / {money(r.expected)}</span>
                    <span className="num text-ink-3">{num(pct(r.collected, r.expected))}%</span>
                  </div>
                  <Progress value={pct(r.collected, r.expected)} tone={r.status === 'closed' ? 'brass' : 'brand'} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
                  <div><dt className="text-ink-3">{t('totalSpent')}</dt><dd className="num font-semibold">{money(r.expenses)}</dd></div>
                  <div><dt className="text-ink-3">{t('remaining')}</dt><dd className="num font-semibold">{money(r.outstanding)}</dd></div>
                  <div><dt className="text-ink-3">{t('closingBalance')}</dt><dd className="num font-semibold">{money(r.closing_balance)}</dd></div>
                </dl>
                <div className="mt-3 flex items-center justify-end text-[13px] font-medium text-brand">
                  {t('details')} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <BulkBar s={s}>
        <BarButton onClick={() => exportSelected<LedgerRow>('months.csv', chosen, [
          ['Month', (r) => month(r)], ['Status', (r) => r.status], ['Per student', (r) => r.contribution_amount + r.special_amount],
          ['Expected', (r) => r.expected], ['Collected', (r) => r.collected], ['Expenses', (r) => r.expenses], ['Closing balance', (r) => r.closing_balance],
        ])}><Download />{t('csvSelected')}</BarButton>
        <BarButton onClick={() => setConfirm('close')}><Lock />{t('closeSelected')}</BarButton>
        <BarButton onClick={() => setConfirm('reopen')}><LockOpen />{t('reopenSelected')}</BarButton>
        <BarButton danger onClick={() => setConfirm('delete')}><Trash2 />{t('bulkDelete')}</BarButton>
      </BulkBar>

      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('deleteMonthsTitle', { n: num(s.count) })}
        body={t('deleteMonthsBody')}
        confirmLabel={t('bulkDelete')}
        danger
        reasonLabel={t('bulkReason')}
        minReason={3}
        loading={del.isPending}
        onConfirm={async (reason) => {
          try {
            const r = await del.mutateAsync(reason);
            toast.success(t('monthsDeleted', { n: num(r.deleted) })); skipped(r.skipped);
            s.clear(); setConfirm(null);
          } catch { /* toast shown */ }
        }}
      />
      <ConfirmDialog
        open={confirm === 'close' || confirm === 'reopen'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'reopen' ? t('reopenMonthsTitle', { n: num(s.count) }) : t('closeMonthsTitle', { n: num(s.count) })}
        body={confirm === 'close' ? t('closeMonthsBody') : undefined}
        confirmLabel={confirm === 'reopen' ? t('reopenSelected') : t('closeSelected')}
        reasonLabel={confirm === 'reopen' ? t('bulkReason') : undefined}
        loading={setStatus.isPending}
        onConfirm={async (reason) => {
          try {
            const r = await setStatus.mutateAsync({ close: confirm === 'close', reason });
            toast.success(t('monthsUpdated', { n: num(r.done) })); skipped(r.skipped);
            s.clear(); setConfirm(null);
          } catch { /* toast shown */ }
        }}
      />

      <CreateMonthDialog open={open} onOpenChange={setOpen} existing={(data ?? []).map((r) => `${r.year}-${r.month}`)} />
    </div>
  );
}

const schema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  contribution: z.coerce.number().int().min(0),
  special: z.coerce.number().int().min(0),
  special_label: z.string().trim().max(80).optional(),
  deadline: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

function CreateMonthDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: string[] }) {
  const { t, lang, year } = useI18n();
  const now = dhakaNowParts();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { year: now.year, month: now.month, contribution: 50, special: 0, special_label: '', deadline: '', notes: '' },
  });
  const save = useAction(
    (v: z.infer<typeof schema>) =>
      rpc('create_fund_month', {
        p_year: v.year, p_month: v.month, p_contribution: v.contribution, p_special: v.special,
        p_special_label: v.special_label || null, p_deadline: v.deadline || null, p_notes: v.notes || null,
      }),
    { success: t('saved'), extraKeys: ['months'] },
  );
  const y = form.watch('year');
  const m = form.watch('month');
  const dup = existing.includes(`${y}-${m}`);
  const special = form.watch('special');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('newMonth')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button loading={save.isPending} disabled={dup} onClick={form.handleSubmit(async (v) => { await save.mutateAsync(v); onOpenChange(false); form.reset(); })}>{t('newMonth')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('month')}>
            <Select {...form.register('month')}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1, lang)}</option>)}
            </Select>
          </Field>
          <Field label={lang === 'bn' ? 'বছর' : 'Year'}>
            <Input type="number" {...form.register('year')} className="num" />
          </Field>
        </div>
        {dup && <p className="text-[13px] text-bad">{lang === 'bn' ? `${monthName(m, lang)} ${year(y)} আগে থেকেই আছে।` : `${monthName(m, lang)} ${y} already exists.`}</p>}
        <Field label={t('contribution')} hint={t('perStudent')}>
          <MoneyInput {...form.register('contribution')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={<>{t('specialAmount')} <span className="text-ink-3">({t('optional')})</span></>}>
            <MoneyInput {...form.register('special')} />
          </Field>
          <Field label={t('specialLabel')}>
            <Input {...form.register('special_label')} disabled={!Number(special)} placeholder="e.g. Picnic" />
          </Field>
        </div>
        <Field label={<>{t('deadline')} <span className="text-ink-3">({t('optional')})</span></>}>
          <Input type="date" {...form.register('deadline')} />
        </Field>
        <Field label={<>{t('note')} <span className="text-ink-3">({t('optional')})</span></>}>
          <Textarea rows={2} {...form.register('notes')} />
        </Field>
      </div>
    </Dialog>
  );
}
