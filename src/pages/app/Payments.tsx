import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, ReceiptText, Undo2 } from 'lucide-react';
import { rpc, supabase } from '@/lib/supabase';
import { useAction, usePayments } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import type { Payment } from '@/lib/types';
import { downloadCsv, cn } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';
import { RecordPaymentDialog } from '@/components/domain/RecordPaymentDialog';
import { ReceiptView } from '@/components/domain/ReceiptView';

export default function Payments() {
  const { t, money, date, month } = useI18n();
  const { can } = useAuth();
  const L = useLookups();
  const [monthId, setMonthId] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [page, setPage] = useState(0);
  const size = 50;
  const { data, isLoading, error, refetch } = usePayments({ monthId: monthId || undefined, collectorId: collectorId || undefined, page, pageSize: size });
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [reversing, setReversing] = useState<Payment | null>(null);
  const reverse = useAction((r: string) => rpc('reverse_payment', { p_payment: reversing!.id, p_reason: r }), { success: t('saved') });
  const rows = data?.rows ?? [];
  const reversedIds = new Set(rows.filter((r) => r.reversal_of).map((r) => r.reversal_of!));
  const staff = L.profiles.filter((p) => ['admin', 'treasurer', 'collector'].includes(p.role));

  const exportAll = async () => {
    let q = supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(5000);
    if (monthId) q = q.eq('month_id', monthId);
    if (collectorId) q = q.eq('collected_by', collectorId);
    const { data: all } = await q;
    downloadCsv('payments.csv', [
      ['Receipt', 'Date', 'Roll', 'Student', 'Month', 'Amount', 'Method', 'Transaction ID', 'Received by', 'Note'],
      ...((all ?? []) as Payment[]).map((p) => {
        const s = L.studentById.get(p.student_id);
        const m = L.monthById.get(p.month_id);
        return [p.receipt_no, p.paid_on, s?.roll, s?.name, m?.title_en, p.amount, p.method, p.transaction_ref, L.personName(p.collected_by), p.note];
      }),
    ]);
  };

  return (
    <div>
      <PageHeader
        title={t('navPayments')}
        actions={
          <>
            <Button variant="secondary" onClick={exportAll}><Download />{t('exportCsv')}</Button>
            {can('admin', 'treasurer', 'collector') && <Button onClick={() => setPayOpen(true)} disabled={!L.openMonths.length}><Plus />{t('recordPayment')}</Button>}
          </>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={monthId} onChange={(e) => { setMonthId(e.target.value); setPage(0); }} aria-label={t('month')}>
            <option value="">{t('month')}: {t('all')}</option>
            {L.months.map((m) => <option key={m.id} value={m.id}>{month(m)}</option>)}
          </Select>
          {can('admin', 'treasurer', 'auditor') && (
            <Select value={collectorId} onChange={(e) => { setCollectorId(e.target.value); setPage(0); }} aria-label={t('receivedBy')}>
              <option value="">{t('receivedBy')}: {t('all')}</option>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </Select>
          )}
        </div>
        {error ? <div className="p-4"><ErrorState error={error} onRetry={() => refetch()} /></div> : isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ReceiptText />} title={t('noPayments')} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => {
              const s = L.studentById.get(p.student_id);
              const m = L.monthById.get(p.month_id);
              const isReversal = !!p.reversal_of;
              const wasReversed = reversedIds.has(p.id);
              return (
                <li key={p.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap', (isReversal || wasReversed) && 'bg-sunken/50')}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setReceipt(p)}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">{s ? <>{s.name} <span className="num text-ink-3">· {s.roll}</span></> : '—'}</span>
                      {isReversal && <Badge tone="bad">{t('reversal')}</Badge>}
                      {wasReversed && <Badge>{t('reversed')}</Badge>}
                    </div>
                    <div className="num text-[12px] text-ink-3">
                      {p.receipt_no} · {m ? month(m) : ''} · {date(p.paid_on)} · {t(`method_${p.method}` as StringKey)} · {L.personName(p.collected_by)}
                    </div>
                  </button>
                  <span className={cn('num text-[15px] font-semibold', p.amount < 0 && 'text-bad')}>{money(p.amount)}</span>
                  {can('admin', 'treasurer') && !isReversal && !wasReversed && m?.status === 'open' && (
                    <Button size="sm" variant="ghost" onClick={() => setReversing(p)}><Undo2 />{t('reverse')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} total={data?.count ?? 0} size={size} onPage={setPage} />
      </Card>

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} />
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} title={t('receipt')} size="sm"
        footer={<><Button variant="secondary" onClick={() => setReceipt(null)}>{t('close')}</Button><Button onClick={() => window.print()}>{t('print')}</Button></>}>
        {receipt && (
          <>
            <ReceiptView payment={receipt} />
            {receipt.reversal_reason && <p className="mt-3 text-[13px] text-bad">{t('reason')}: {receipt.reversal_reason}</p>}
            {receipt.note && <p className="mt-2 text-[13px] text-ink-3">{t('note')}: {receipt.note}</p>}
            <Link to={`/app/students/${receipt.student_id}`} className="mt-3 block text-[13px] font-medium text-brand">{t('paymentHistory')} →</Link>
          </>
        )}
      </Dialog>
      <ConfirmDialog open={!!reversing} onOpenChange={(o) => !o && setReversing(null)} title={t('reversePayment')} body={<>{t('reverseBody')}<div className="num mt-2 font-medium text-ink">{reversing?.receipt_no} · {money(reversing?.amount)}</div></>}
        confirmLabel={t('reverse')} reasonLabel={t('reason')} danger loading={reverse.isPending}
        onConfirm={async (r) => { await reverse.mutateAsync(r).catch(() => {}); setReversing(null); }} />
    </div>
  );
}
