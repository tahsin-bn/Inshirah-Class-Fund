import type { Payment, PaymentMethod } from '@/lib/types';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { useSettings } from '@/lib/queries';
import { Logo } from '@/components/layout/Logo';
import { useLookups } from './lookups';

/** Printable receipt. Uses the browser's print dialog (Save as PDF works too). */
export function ReceiptView({ payment }: { payment: Payment }) {
  const { t, money, date, dateTime, month } = useI18n();
  const { data: settings } = useSettings();
  const L = useLookups();
  const s = L.studentById.get(payment.student_id);
  const m = L.monthById.get(payment.month_id);
  const rows: [string, string][] = [
    [t('receiptNo'), payment.receipt_no],
    [t('student'), s ? `${s.name} (${t('roll')} ${s.roll})` : '—'],
    [t('month'), m ? month(m) : '—'],
    [t('paidOn'), date(payment.paid_on)],
    [t('method'), t(`method_${payment.method as PaymentMethod}` as StringKey)],
    ...(payment.transaction_ref ? [[t('txRef'), payment.transaction_ref] as [string, string]] : []),
    [t('receivedBy'), L.personName(payment.collected_by)],
  ];
  return (
    <div id="receipt" className="rounded-[12px] border border-dashed border-line-strong p-5">
      <div className="flex items-center gap-3">
        <Logo small />
        <div>
          <div className="text-[14px] font-semibold">{settings?.app_name ?? t('appName')}</div>
          <div className="text-[12px] text-ink-3">{settings?.class_name}</div>
        </div>
      </div>
      <div className="num my-4 text-center text-[32px] font-semibold tracking-tight">{money(payment.amount)}</div>
      <dl className="divide-y divide-line text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1.5">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-center text-[11px] text-ink-3">{dateTime(payment.created_at)}</p>
    </div>
  );
}
