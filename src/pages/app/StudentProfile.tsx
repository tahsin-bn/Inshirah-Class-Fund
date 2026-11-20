import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Cake, Mail, Phone, Plus } from 'lucide-react';
import { usePayments, useStudentStatuses } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { ageOn, daysUntilBirthday } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card, CardHeader, Stat } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, PageSkeleton } from '@/components/ui/misc';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useLookups } from '@/components/domain/lookups';
import { RecordPaymentDialog } from '@/components/domain/RecordPaymentDialog';

export default function StudentProfile() {
  const { id } = useParams();
  const { t, money, date, month, num } = useI18n();
  const { can, role, session } = useAuth();
  const L = useLookups();
  const statuses = useStudentStatuses(id);
  const payments = usePayments({ studentId: id, pageSize: 200 });
  const [pay, setPay] = useState<{ open: boolean; month?: string }>({ open: false });

  if (L.loading) return <PageSkeleton />;
  const s = id ? L.studentById.get(id) : undefined;
  if (!s) return <EmptyState title={t('noResults')} action={<Link to="/app/students"><Button variant="secondary">{t('navStudents')}</Button></Link>} />;

  const st = [...(statuses.data ?? [])].sort((a, b) => {
    const ma = L.monthById.get(a.month_id), mb = L.monthById.get(b.month_id);
    return (mb?.year ?? 0) * 12 + (mb?.month ?? 0) - ((ma?.year ?? 0) * 12 + (ma?.month ?? 0));
  });
  const totalPaid = st.reduce((x, r) => x + r.paid, 0);
  const totalDue = st.reduce((x, r) => x + r.remaining, 0);
  const totalWaived = st.reduce((x, r) => x + r.waived, 0);
  const collector = L.collectorOf.get(s.id);
  const canPay = can('admin', 'treasurer') || (role === 'collector' && collector === session?.user.id);
  const dTo = s.birthdate ? daysUntilBirthday(s.birthdate) : null;

  return (
    <div className="space-y-5">
      <Link to="/app/students" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />{t('navStudents')}</Link>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={s.name} className="size-14 text-[18px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold">{s.name}</h1>
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-3">
              <span className="num">{t('roll')} {s.roll}</span>
              {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone className="size-3.5" />{s.phone}</a>}
              {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail className="size-3.5" />{s.email}</a>}
              {s.birthdate && (
                <span className="inline-flex items-center gap-1"><Cake className="size-3.5" />{date(s.birthdate)}
                  {dTo === 0 ? <Badge tone="brass">{t('today')}</Badge> : null}
                  <span>· {t('turns', { n: ageOn(s.birthdate) + (dTo === 0 ? 0 : 1) })}</span>
                </span>
              )}
              <span>{t('collector')}: {collector ? L.personName(collector) : t('unassigned')}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('paid')} value={money(totalPaid)} tone="brand" />
        <Stat label={t('remaining')} value={money(totalDue)} tone={totalDue ? 'warn' : 'good'} />
        <Stat label={t('waived')} value={money(totalWaived)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('monthByMonth')} />
          {st.length === 0 ? <EmptyState title={t('noMonthsYet')} /> : (
            <ul className="divide-y divide-line border-t border-line">
              {st.map((r) => {
                const m = L.monthById.get(r.month_id);
                return (
                  <li key={r.month_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1">
                      <div className="text-[14px] font-medium">{m ? month(m) : ''}</div>
                      <div className="num text-[12px] text-ink-3">{money(r.paid)} / {money(r.expected)}{r.waived ? ` · ${t('waived')} ${money(r.waived)}` : ''}</div>
                    </div>
                    <StatusBadge status={r.status} />
                    {canPay && m?.status === 'open' && r.remaining > 0 && <Button size="icon-sm" aria-label={t('recordPayment')} onClick={() => setPay({ open: true, month: r.month_id })}><Plus /></Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t('paymentHistory')} description={num(payments.data?.count ?? 0)} />
          {(payments.data?.rows ?? []).length === 0 ? <EmptyState title={t('noPayments')} /> : (
            <ul className="divide-y divide-line border-t border-line">
              {(payments.data?.rows ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <div className="num text-[14px] font-medium">{p.receipt_no}</div>
                    <div className="text-[12px] text-ink-3">{date(p.paid_on)} · {t(`method_${p.method}` as StringKey)} · {L.personName(p.collected_by)}</div>
                  </div>
                  <span className={cn('num font-semibold', p.amount < 0 && 'text-bad')}>{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {s.notes && <Card className="p-5 text-[14px] text-ink-2">{s.notes}</Card>}
      <RecordPaymentDialog open={pay.open} onOpenChange={(o) => setPay({ open: o })} studentId={s.id} monthId={pay.month} />
    </div>
  );
}
