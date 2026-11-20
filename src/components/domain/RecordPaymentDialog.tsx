import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { rpc } from '@/lib/supabase';
import { useAction, useMonthStatuses } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { dhakaToday } from '@/lib/format';
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from '@/lib/types';
import { uuid } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { StudentPicker } from './StudentPicker';
import { useLookups } from './lookups';
import { ReceiptView } from './ReceiptView';

const schema = z
  .object({
    amount: z.coerce.number().int().positive(),
    method: z.enum(['cash', 'bkash', 'nagad', 'rocket', 'bank', 'other']),
    paid_on: z.string().min(10),
    transaction_ref: z.string().trim().max(80).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.method === 'cash' || (v.transaction_ref ?? '').length > 0, { path: ['transaction_ref'] });

type FormValues = z.infer<typeof schema>;

export function RecordPaymentDialog({
  open, onOpenChange, monthId, studentId,
}: { open: boolean; onOpenChange: (o: boolean) => void; monthId?: string; studentId?: string }) {
  const { t, money, month: monthLabel, pick } = useI18n();
  const { role, session } = useAuth();
  const L = useLookups();
  const [month, setMonth] = useState(monthId ?? '');
  const [student, setStudent] = useState(studentId ?? '');
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const clientRef = useRef(uuid());

  useEffect(() => {
    if (open) {
      setMonth(monthId ?? L.latestOpenMonth?.id ?? '');
      setStudent(studentId ?? '');
      setReceipt(null);
      clientRef.current = uuid();
    }
  }, [open, monthId, studentId, L.latestOpenMonth?.id]);

  const { data: statuses } = useMonthStatuses(month || undefined);
  const statusOf = useMemo(() => new Map((statuses ?? []).map((s) => [s.student_id, s])), [statuses]);
  const current = statusOf.get(student);

  // collectors only see (and may only pay for) their assigned students
  const pickable = useMemo(
    () => (role === 'collector' ? L.students.filter((s) => L.collectorOf.get(s.id) === session?.user.id) : L.students),
    [role, L.students, L.collectorOf, session?.user.id],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { method: 'cash', paid_on: dhakaToday(), amount: 0, transaction_ref: '', note: '' },
  });
  const method = form.watch('method');

  useEffect(() => {
    if (current) form.setValue('amount', current.remaining);
  }, [current, form]);

  const save = useAction(
    (v: FormValues) =>
      rpc<Payment>('record_payment', {
        p_student: student,
        p_month: month,
        p_amount: v.amount,
        p_method: v.method,
        p_paid_on: v.paid_on,
        p_transaction_ref: v.transaction_ref || null,
        p_note: v.note || null,
        p_client_ref: clientRef.current,
      }),
    { success: t('paymentRecorded') },
  );

  const submit = form.handleSubmit(async (v) => {
    if (current && v.amount > current.remaining) {
      form.setError('amount', { message: t('remainingDue', { a: money(current.remaining) }) });
      return;
    }
    const p = await save.mutateAsync(v).catch(() => null);
    if (p) setReceipt(p);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={receipt ? t('paymentRecorded') : t('recordPayment')}
      size="md"
      footer={
        receipt ? (
          <>
            <Button variant="secondary" onClick={() => window.print()}>{t('print')}</Button>
            <Button
              onClick={() => {
                setReceipt(null);
                setStudent('');
                clientRef.current = uuid();
                form.reset({ method: 'cash', paid_on: dhakaToday(), amount: 0, transaction_ref: '', note: '' });
              }}
            >
              {pick('Record another', 'আরেকটি রেকর্ড করুন')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button onClick={submit} loading={save.isPending} disabled={!student || !month || !current || current.remaining <= 0}>
              {t('recordPayment')}
            </Button>
          </>
        )
      }
    >
      {receipt ? (
        <div>
          <div className="mb-4 flex items-center gap-2 text-good"><CheckCircle2 className="size-5" /> {receipt.receipt_no}</div>
          <ReceiptView payment={receipt} />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('month')}>
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {L.openMonths.length === 0 && <option value="">—</option>}
              {L.openMonths.map((m) => <option key={m.id} value={m.id}>{monthLabel(m)}</option>)}
            </Select>
          </Field>
          <Field label={t('student')}>
            <StudentPicker
              students={pickable}
              value={student}
              onChange={setStudent}
              extra={(s) => {
                const st = statusOf.get(s.id);
                return st ? <StatusBadge status={st.status} /> : null;
              }}
            />
          </Field>
          {current && (
            <div className="rounded-[10px] bg-sunken px-3 py-2 text-[13px] text-ink-2">
              {L.studentById.get(student)?.name} · {t('expected')} {money(current.expected)} · {t('paid')} {money(current.paid)}
              {current.waived > 0 && <> · {t('waived')} {money(current.waived)}</>} · <b className="text-ink">{t('remainingDue', { a: money(current.remaining) })}</b>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('amount')} error={form.formState.errors.amount?.message || (form.formState.errors.amount && t('required'))}>
              <MoneyInput {...form.register('amount')} max={current?.remaining} />
            </Field>
            <Field label={t('paidOn')}>
              <Input type="date" max={dhakaToday()} {...form.register('paid_on')} />
            </Field>
          </div>
          <Field label={t('method')}>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className="cursor-pointer">
                  <input type="radio" value={m} className="peer sr-only" {...form.register('method')} />
                  <span className="flex h-10 items-center justify-center rounded-[8px] border border-line-strong text-[13px] font-medium text-ink-2 peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
                    {t(`method_${m as PaymentMethod}` as StringKey)}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          {method !== 'cash' && (
            <Field label={t('txRef')} hint={t('txRefHint')} error={form.formState.errors.transaction_ref && t('txRefHint')}>
              <Input {...form.register('transaction_ref')} placeholder="e.g. 9F7K2L1Q" />
            </Field>
          )}
          <Field label={<>{t('note')} <span className="text-ink-3">({t('optional')})</span></>}>
            <Textarea rows={2} {...form.register('note')} />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
