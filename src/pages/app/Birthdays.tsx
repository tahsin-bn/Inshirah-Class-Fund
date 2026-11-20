import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cake, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ageOn, daysUntilBirthday, dhakaNowParts, dhakaToday, monthName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Student } from '@/lib/types';
import { useI18n } from '@/i18n/I18nProvider';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Avatar, EmptyState, PageHeader, PageSkeleton } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';

/** Real birthdates only — a missing date is never treated as a birthday. */
export default function Birthdays() {
  const { t, lang, num, pick } = useI18n();
  const { can } = useAuth();
  const L = useLookups();
  const now = dhakaNowParts();
  const [m, setM] = useState(now.month);
  const [q, setQ] = useState('');
  const today = dhakaToday();

  const withDates = useMemo(
    () => L.students.filter((s): s is Student & { birthdate: string } => s.status === 'active' && !!s.birthdate),
    [L.students],
  );
  const missing = L.students.filter((s) => s.status === 'active' && !s.birthdate);
  const enriched = useMemo(() => withDates.map((s) => ({ s, d: daysUntilBirthday(s.birthdate, today) })).sort((a, b) => a.d - b.d), [withDates, today]);
  const todays = enriched.filter((x) => x.d === 0);
  const week = enriched.filter((x) => x.d > 0 && x.d <= 7);
  const month30 = enriched.filter((x) => x.d > 7 && x.d <= 30);
  const inMonth = withDates
    .filter((s) => Number(s.birthdate.slice(5, 7)) === m)
    .filter((s) => !q.trim() || s.name.toLowerCase().includes(q.toLowerCase()) || s.roll.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.birthdate.slice(8, 10)) - Number(b.birthdate.slice(8, 10)));
  const searchHits = q.trim() ? withDates.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.roll.toLowerCase().includes(q.toLowerCase())) : [];

  if (L.loading) return <PageSkeleton />;

  const when = (d: number) => (d === 0 ? t('today') : d === 1 ? t('tomorrow') : t('inDays', { n: d }));
  const dayMonth = (iso: string) => `${num(Number(iso.slice(8, 10)))} ${monthName(Number(iso.slice(5, 7)), lang)}`;
  const counts = Array.from({ length: 12 }, (_, i) => withDates.filter((s) => Number(s.birthdate.slice(5, 7)) === i + 1).length);

  return (
    <div className="space-y-5">
      <PageHeader title={t('navBirthdays')} description={missing.length ? t('missingBirthdates', { n: missing.length }) : undefined} />

      {/* Today */}
      <Card className={cn('overflow-hidden', todays.length && 'border-brass/40')}>
        <div className={cn('flex flex-col gap-4 p-5 sm:flex-row sm:items-center', todays.length ? 'bg-brass-soft' : '')}>
          <div className={cn('grid size-12 shrink-0 place-items-center rounded-full', todays.length ? 'bg-brass text-white' : 'bg-sunken text-ink-3')}>
            <Cake className="size-6" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] text-ink-3">{t('birthdaysToday')} · {dayMonth(today)}</div>
            {todays.length ? (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {todays.map(({ s }) => (
                  <Link key={s.id} to={`/app/students/${s.id}`} className="text-[18px] font-semibold hover:underline">
                    {s.name} <span className="text-[13px] font-normal text-ink-3">{t('turns', { n: ageOn(s.birthdate, today) })}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-[15px] text-ink-2">{t('noBirthdaysToday')}</div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingList title={t('next7')} items={week} when={when} dayMonth={dayMonth} />
        <UpcomingList title={t('next30')} items={month30} when={when} dayMonth={dayMonth} />
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader
          title={t('calendar')}
          action={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={t('prev')} onClick={() => setM(m === 1 ? 12 : m - 1)}><ChevronLeft /></Button>
              <span className="w-28 text-center text-[14px] font-semibold">{monthName(m, lang)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t('next')} onClick={() => setM(m === 12 ? 1 : m + 1)}><ChevronRight /></Button>
            </div>
          }
        />
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto px-5 pb-4">
          {counts.map((c, i) => (
            <button key={i} onClick={() => setM(i + 1)} className={cn('flex min-w-[64px] flex-col items-center rounded-[10px] border px-2 py-2 text-[12px]', m === i + 1 ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-3 hover:bg-sunken')}>
              <span className="font-medium">{monthName(i + 1, lang, true)}</span>
              <span className="num text-[15px] font-semibold text-ink">{num(c)}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-line p-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pickStudent')} className="pl-9" />
          </div>
          {searchHits.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {searchHits.slice(0, 8).map((s) => (
                <button key={s.id} onClick={() => setM(Number(s.birthdate.slice(5, 7)))} className="rounded-full border border-line px-3 py-1 text-[13px] hover:bg-sunken">
                  {s.name} · {dayMonth(s.birthdate)}
                </button>
              ))}
            </div>
          )}
        </div>
        {inMonth.length === 0 ? (
          <EmptyState icon={<Cake />} title={pick('No birthdays in this month.', 'এই মাসে কারো জন্মদিন নেই।')} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {inMonth.map((s) => {
              const d = daysUntilBirthday(s.birthdate, today);
              return (
                <li key={s.id} className={cn('flex items-center gap-3 px-5 py-3', d === 0 && 'bg-brass-soft/60')}>
                  <div className="num w-12 shrink-0 text-center">
                    <div className="text-[20px] font-semibold leading-none">{num(Number(s.birthdate.slice(8, 10)))}</div>
                    <div className="text-[11px] text-ink-3">{monthName(m, lang, true)}</div>
                  </div>
                  <Avatar name={s.name} />
                  <Link to={`/app/students/${s.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium hover:underline">{s.name}</div>
                    <div className="num text-[12px] text-ink-3">{t('roll')} {s.roll}</div>
                  </Link>
                  {d === 0 ? <Badge tone="brass">{t('today')}</Badge> : d <= 30 ? <Badge tone="info">{when(d)}</Badge> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {can('admin') && missing.length > 0 && (
        <Card>
          <CardHeader title={t('missingBirthdates', { n: missing.length })} description={pick('Add dates from the student list. Missing dates never show as birthdays.', 'শিক্ষার্থী তালিকা থেকে তারিখ যোগ করুন। জন্ম তারিখ না থাকলে জন্মদিন দেখানো হয় না।')} />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {missing.slice(0, 40).map((s) => <Link key={s.id} to={`/app/students/${s.id}`} className="rounded-full border border-line px-3 py-1 text-[13px] hover:bg-sunken">{s.roll} · {s.name}</Link>)}
          </div>
        </Card>
      )}
    </div>
  );
}

function UpcomingList({ title, items, when, dayMonth }: { title: string; items: { s: Student & { birthdate: string }; d: number }[]; when: (d: number) => string; dayMonth: (iso: string) => string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={title} />
      {items.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink-3">{t('none')}</p> : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map(({ s, d }) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
              <Avatar name={s.name} />
              <Link to={`/app/students/${s.id}`} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:underline">{s.name}</Link>
              <span className="text-[13px] text-ink-3">{dayMonth(s.birthdate)}</span>
              <Badge tone="info">{when(d)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
