import { useEffect, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { useAction, useSettings } from '@/lib/queries';
import type { Settings as S } from '@/lib/types';
import { useI18n } from '@/i18n/I18nProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput } from '@/components/ui/form';
import { PageHeader, PageSkeleton, Switch } from '@/components/ui/misc';

export default function Settings() {
  const { t, pick, money, dateTime } = useI18n();
  const { data, isLoading } = useSettings();
  const [f, setF] = useState<S | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = useAction(
    () => rpc('update_settings', {
      p: {
        app_name: f!.app_name, class_name: f!.class_name, opening_balance: Number(f!.opening_balance), opening_balance_note: f!.opening_balance_note ?? '',
        other_income_enabled: f!.other_income_enabled, public_dashboard_enabled: f!.public_dashboard_enabled,
        public_show_expense_items: f!.public_show_expense_items, public_birthdays_enabled: f!.public_birthdays_enabled, max_collectors: Number(f!.max_collectors),
      },
      p_reason: reason || null,
    }),
    { success: t('saved'), extraKeys: ['settings'] },
  );
  if (isLoading || !f) return <PageSkeleton />;
  const openingChanged = Number(f.opening_balance) !== data!.opening_balance;
  const set = <K extends keyof S>(k: K, v: S[K]) => setF({ ...f, [k]: v });

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title={t('navSettings')} description={`${t('lastUpdated')}: ${dateTime(data!.updated_at)}`} />
      <Card>
        <CardHeader title={t('general')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={pick('App name', 'অ্যাপের নাম')}><Input value={f.app_name} onChange={(e) => set('app_name', e.target.value)} /></Field>
          <Field label={t('className')}><Input value={f.class_name} onChange={(e) => set('class_name', e.target.value)} /></Field>
          <Field label={t('maxCollectors')}><Input type="number" min={1} max={50} className="num" value={f.max_collectors} onChange={(e) => set('max_collectors', Number(e.target.value))} /></Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('openingBalance')} description={pick('The money the fund held before the first month in this app. Every month carries forward from it.', 'এই অ্যাপের প্রথম মাসের আগে ফান্ডে যে টাকা ছিল। প্রতিটি মাস এখান থেকে হিসাব শুরু করে।')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('openingBalance')} hint={openingChanged ? `${money(data!.opening_balance)} → ${money(Number(f.opening_balance))}` : undefined}><MoneyInput value={f.opening_balance} onChange={(e) => set('opening_balance', Number(e.target.value))} /></Field>
          <Field label={t('openingNote')}><Input value={f.opening_balance_note ?? ''} onChange={(e) => set('opening_balance_note', e.target.value)} /></Field>
          {openingChanged && <Field label={t('openingReason')} className="sm:col-span-2" hint={pick('Required. Saved in the audit log.', 'আবশ্যক। অডিট লগে সংরক্ষিত হবে।')}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('publicPage')} />
        <CardBody className="divide-y divide-line">
          <Switch checked={f.public_dashboard_enabled} onCheckedChange={(v) => set('public_dashboard_enabled', v)} label={t('publicDashboardOn')} description={pick('Totals and monthly summaries only. Never names, rolls or individual payments.', 'শুধু মোট ও মাসিক সারাংশ। নাম, রোল বা ব্যক্তিগত পেমেন্ট কখনো নয়।')} />
          <Switch checked={f.public_show_expense_items} onCheckedChange={(v) => set('public_show_expense_items', v)} label={t('publicExpensesOn')} description={pick('Title, category, date and amount. No submitter names.', 'শিরোনাম, খাত, তারিখ ও পরিমাণ। জমাদাতার নাম নয়।')} />
          <Switch checked={f.public_birthdays_enabled} onCheckedChange={(v) => set('public_birthdays_enabled', v)} label={t('publicBirthdaysOn')} description={pick('Off by default. Shows only the names of students whose birthday is today.', 'ডিফল্টভাবে বন্ধ। শুধু আজ যাদের জন্মদিন তাদের নাম দেখাবে।')} />
          <Switch checked={f.other_income_enabled} onCheckedChange={(v) => set('other_income_enabled', v)} label={t('otherIncomeOn')} description={pick('Recorded separately from student contributions on each month page.', 'প্রতিটি মাসের পেজে শিক্ষার্থীর চাঁদা থেকে আলাদাভাবে রেকর্ড হবে।')} />
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setF(data!); setReason(''); }}>{t('cancel')}</Button>
        <Button loading={save.isPending} disabled={openingChanged && reason.trim().length < 5} onClick={() => save.mutateAsync(undefined).then(() => setReason('')).catch(() => {})}>{t('saveChanges')}</Button>
      </div>
    </div>
  );
}
