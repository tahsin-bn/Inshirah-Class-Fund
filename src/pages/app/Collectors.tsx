import { useMemo, useState } from 'react';
import { Search, UserCog } from 'lucide-react';
import { rpc } from '@/lib/supabase';
import { useAction, useCollectorSummaries, useSettings } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/I18nProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Avatar, Checkbox, EmptyState, PageHeader, PageSkeleton } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';
import { cn } from '@/lib/utils';

export default function Collectors() {
  const { t, money, num } = useI18n();
  const { can } = useAuth();
  const L = useLookups();
  const summaries = useCollectorSummaries();
  const { data: settings } = useSettings();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'unassigned' | string>('all');

  const assign = useAction((v: { collector: string | null; students: string[] }) => rpc<number>('assign_students', { p_collector: v.collector, p_students: v.students }), { success: t('saved'), extraKeys: ['assignments'] });

  const collectors = L.profiles.filter((p) => p.role === 'collector' && p.is_active);
  const active = useMemo(() => L.students.filter((s) => s.status === 'active'), [L.students]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return active
      .filter((x) => show === 'all' || (show === 'unassigned' ? !L.collectorOf.get(x.id) : L.collectorOf.get(x.id) === show))
      .filter((x) => !s || x.name.toLowerCase().includes(s) || x.roll.toLowerCase().includes(s))
      .sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
  }, [active, show, q, L.collectorOf]);

  if (L.loading || summaries.isLoading) return <PageSkeleton />;
  const allChecked = list.length > 0 && list.every((s) => selected.has(s.id));
  const someChecked = list.some((s) => selected.has(s.id));
  const unassignedCount = active.filter((s) => !L.collectorOf.get(s.id)).length;

  return (
    <div className="space-y-5">
      <PageHeader title={t('navCollectors')} description={t('collectorLimit', { n: collectors.length, m: settings?.max_collectors ?? 10 })} />

      {collectors.length === 0 ? (
        <Card><EmptyState icon={<UserCog />} title={t('noCollectors')} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {collectors.map((c) => {
            const s = summaries.data?.find((x) => x.collector_id === c.id);
            return (
              <button key={c.id} onClick={() => setShow(show === c.id ? 'all' : c.id)} className="text-left">
                <Card className={cn('flex items-center gap-3 p-4 transition-colors hover:border-line-strong', show === c.id && 'ring-2 ring-brand')}>
                  <Avatar name={c.full_name || c.email} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{c.full_name || c.email}</div>
                    <div className="num text-[12px] text-ink-3">{num(s?.assigned_students ?? 0)} {t('navStudents').toLowerCase()} · {t('cashInHand')} {money(s?.cash_in_hand)}</div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pickStudent')} className="pl-9" />
          </div>
          <Select value={show} onChange={(e) => setShow(e.target.value)} className="lg:w-56">
            <option value="all">{t('all')} ({num(active.length)})</option>
            <option value="unassigned">{t('unassigned')} ({num(unassignedCount)})</option>
            {collectors.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
          </Select>
          {can('admin') && (
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <span className="text-[13px] text-ink-3">{t('selected', { n: selected.size })}</span>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-48" aria-label={t('assignTo')}>
                <option value="">{t('assignTo')}…</option>
                {collectors.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
                <option value="-">{t('unassigned')}</option>
              </Select>
              <Button
                disabled={!selected.size || !target}
                loading={assign.isPending}
                onClick={async () => {
                  await assign.mutateAsync({ collector: target === '-' ? null : target, students: [...selected] }).catch(() => {});
                  setSelected(new Set());
                }}
              >
                {t('assignStudents')}
              </Button>
            </div>
          )}
        </div>
        <ul className="divide-y divide-line">
          {can('admin') && list.length > 0 && (
            <li className="flex items-center gap-3 bg-sunken/50 px-4 py-2 text-[12px] text-ink-3">
              <Checkbox
                checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                onCheckedChange={(v) => setSelected(v ? new Set([...selected, ...list.map((s) => s.id)]) : new Set([...selected].filter((id) => !list.some((s) => s.id === id))))}
                label={t('all')}
              />
              {t('all')}
            </li>
          )}
          {list.map((s) => {
            const cid = L.collectorOf.get(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-sunken/40">
                  {can('admin') && (
                    <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => { const n = new Set(selected); if (v) n.add(s.id); else n.delete(s.id); setSelected(n); }} label={s.name} />
                  )}
                  <span className="num w-12 text-[13px] text-ink-3">{s.roll}</span>
                  <span className="flex-1 truncate text-[14px]">{s.name}</span>
                  {cid ? <span className="text-[13px] text-ink-2">{L.personName(cid)}</span> : <Badge tone="warn">{t('unassigned')}</Badge>}
                </label>
              </li>
            );
          })}
          {list.length === 0 && <EmptyState title={t('noResults')} />}
        </ul>
      </Card>
    </div>
  );
}
