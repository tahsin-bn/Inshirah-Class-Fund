import { useRef, useState } from 'react';
import { ArrowLeftRight, Check, Info, Plus, X } from 'lucide-react';
import { rpc } from '@/lib/supabase';
import { useAction, useCollectorSummaries, useHandovers } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { PAYMENT_METHODS, type Handover, type HandoverStatus, type PaymentMethod } from '@/lib/types';
import { uuid, downloadCsv } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card, Stat } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';

export default function Handovers() {
  const { t, money, dateTime } = useI18n();
  const { role, can } = useAuth();
  const L = useLookups();
  const { data, isLoading, error, refetch } = useHandovers();
  const summaries = useCollectorSummaries();
  const [status, setStatus] = useState<'all' | HandoverStatus>('pending');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<Handover | null>(null);
  const [rejecting, setRejecting] = useState<Handover | null>(null);
  const confirm = useAction(() => rpc('decide_handover', { p_handover: confirming!.id, p_confirm: true }), { success: t('st_confirmed') });
  const reject = useAction((r: string) => rpc('decide_handover', { p_handover: rejecting!.id, p_confirm: false, p_reason: r }), { success: t('st_rejected') });

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const all = data ?? [];
  const list = all.filter((h) => status === 'all' || h.status === status);
  const me = role === 'collector' ? summaries.data?.[0] : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('navHandovers')}
        description={t('handoverNote')}
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCsv('handovers.csv', [
              ['No', 'Date', 'Collector', 'Amount', 'Method', 'Reference', 'Status', 'Received by', 'Reason'],
              ...all.map((h) => [h.handover_no, h.handed_at, L.personName(h.collector_id), h.amount, h.method, h.reference, h.status, L.personName(h.received_by), h.reject_reason]),
            ])}>{t('exportCsv')}</Button>
            {role === 'collector' && <Button onClick={() => setSubmitting(true)}><Plus />{t('newHandover')}</Button>}
          </>
        }
      />

      {me && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('cashInHand')} value={money(me.cash_in_hand)} tone="brand" />
          <Stat label={t('st_pending')} value={money(me.handed_pending)} tone={me.handed_pending ? 'warn' : 'ink'} />
          <Stat label={t('st_confirmed')} value={money(me.handed_confirmed)} />
        </div>
      )}

      {can('admin', 'treasurer', 'auditor') && (summaries.data ?? []).length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="bg-sunken/60 text-left text-[12px] text-ink-3">
              <tr><th className="px-4 py-2.5 font-medium">{t('collector')}</th><th className="px-4 py-2.5 text-right font-medium">{t('collected')} ({t('method_cash')})</th><th className="px-4 py-2.5 text-right font-medium">{t('st_confirmed')}</th><th className="px-4 py-2.5 text-right font-medium">{t('st_pending')}</th><th className="px-4 py-2.5 text-right font-medium">{t('cashInHand')}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(summaries.data ?? []).map((s) => (
                <tr key={s.collector_id}>
                  <td className="px-4 py-2.5 font-medium">{s.full_name}</td>
                  <td className="num px-4 py-2.5 text-right">{money(s.cash_collected)}</td>
                  <td className="num px-4 py-2.5 text-right">{money(s.handed_confirmed)}</td>
                  <td className="num px-4 py-2.5 text-right">{money(s.handed_pending)}</td>
                  <td className="num px-4 py-2.5 text-right font-semibold">{money(s.cash_in_hand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <div className="border-b border-line p-4">
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'pending', label: t('st_pending'), count: all.filter((h) => h.status === 'pending').length },
            { value: 'confirmed', label: t('st_confirmed'), count: all.filter((h) => h.status === 'confirmed').length },
            { value: 'rejected', label: t('st_rejected'), count: all.filter((h) => h.status === 'rejected').length },
            { value: 'all', label: t('all'), count: all.length },
          ]} />
        </div>
        {list.length === 0 ? <EmptyState icon={<ArrowLeftRight />} title={t('noHandovers')} /> : (
          <ul className="divide-y divide-line">
            {list.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{L.personName(h.collector_id)} <span className="num text-[12px] text-ink-3">· {h.handover_no}</span></div>
                  <div className="text-[12px] text-ink-3">
                    {dateTime(h.handed_at)} · {t(`method_${h.method}` as StringKey)}{h.reference && ` · ${h.reference}`}
                    {h.received_by && ` · ${t('receivedBy')}: ${L.personName(h.received_by)}`}
                  </div>
                  {h.note && <div className="text-[12px] text-ink-2">{h.note}</div>}
                  {h.reject_reason && <div className="text-[12px] text-bad">{t('reason')}: {h.reject_reason}</div>}
                </div>
                <StatusBadge status={h.status} />
                <span className="num w-24 text-right text-[15px] font-semibold">{money(h.amount)}</span>
                {h.status === 'pending' && can('admin', 'treasurer') && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => setConfirming(h)}><Check />{t('confirm')}</Button>
                    <Button size="sm" variant="danger-ghost" onClick={() => setRejecting(h)}><X />{t('reject')}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SubmitDialog open={submitting} onOpenChange={setSubmitting} available={me ? me.cash_in_hand - me.handed_pending : 0} />
      <ConfirmDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)} title={t('confirm')}
        body={confirming && <>{L.personName(confirming.collector_id)} · <b className="num text-ink">{money(confirming.amount)}</b><p className="mt-2">{t('handoverNote')}</p></>}
        confirmLabel={t('confirm')} loading={confirm.isPending} onConfirm={async () => { await confirm.mutateAsync(undefined).catch(() => {}); setConfirming(null); }} />
      <ConfirmDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={t('reject')} confirmLabel={t('reject')} reasonLabel={t('rejectReason')} minReason={3} danger loading={reject.isPending}
        onConfirm={async (r) => { await reject.mutateAsync(r).catch(() => {}); setRejecting(null); }} />
    </div>
  );
}

function SubmitDialog({ open, onOpenChange, available }: { open: boolean; onOpenChange: (o: boolean) => void; available: number }) {
  const { t, money } = useI18n();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const ref = useRef(uuid());
  const save = useAction(() => rpc('submit_handover', { p_amount: Number(amount), p_method: method, p_reference: reference || null, p_note: note || null, p_client_ref: ref.current }), { success: t('saved') });
  const valid = Number(amount) > 0 && Number(amount) <= available;
  const reset = () => { setAmount(''); setReference(''); setNote(''); ref.current = uuid(); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }} title={t('newHandover')} size="sm"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button><Button disabled={!valid} loading={save.isPending} onClick={async () => { await save.mutateAsync(undefined).catch(() => {}); reset(); onOpenChange(false); }}>{t('newHandover')}</Button></>}>
      <div className="space-y-4">
        <p className="flex gap-2 rounded-[10px] bg-info-soft p-3 text-[13px] text-info"><Info className="mt-0.5 size-4 shrink-0" />{t('availableToHand', { a: money(available) })}</p>
        <Field label={t('amount')}>
          <div className="flex gap-2"><MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} max={available} /><Button variant="secondary" onClick={() => setAmount(String(available))} disabled={available <= 0}>{t('payFull')}</Button></div>
        </Field>
        <Field label={t('method')}><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`method_${m}` as StringKey)}</option>)}</Select></Field>
        <Field label={<>{t('reference')} <span className="text-ink-3">({t('optional')})</span></>}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label={<>{t('note')} <span className="text-ink-3">({t('optional')})</span></>}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
