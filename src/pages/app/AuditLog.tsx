import { useState } from 'react';
import { History } from 'lucide-react';
import { useAuditLog } from '@/lib/queries';
import type { AuditLog as Row } from '@/lib/types';
import { useI18n } from '@/i18n/I18nProvider';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';

const TABLES = ['payments', 'expenses', 'handovers', 'waivers', 'students', 'student_collector_assignments', 'fund_months', 'profiles', 'app_settings', 'other_income', 'expense_categories'];
const IGNORE = new Set(['updated_at', 'created_at']);

function diff(r: Row): [string, unknown, unknown][] {
  const o = r.old_data ?? {};
  const n = r.new_data ?? {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).filter((k) => !IGNORE.has(k));
  return keys.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])).map((k) => [k, o[k], n[k]]);
}

export default function AuditLog() {
  const { t, dateTime } = useI18n();
  const L = useLookups();
  const [page, setPage] = useState(0);
  const [table, setTable] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const { data, isLoading, error } = useAuditLog(page, table || undefined);
  const tone = (a: string) => (a === 'insert' ? 'good' : a === 'update' ? 'info' : 'bad') as 'good' | 'info' | 'bad';

  return (
    <div>
      <PageHeader title={t('navAudit')} description={t('auditHint')} />
      <Card>
        <div className="border-b border-line p-4">
          <Select value={table} onChange={(e) => { setTable(e.target.value); setPage(0); }} className="sm:w-64" aria-label={t('record')}>
            <option value="">{t('record')}: {t('all')}</option>
            {TABLES.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </div>
        {error ? <div className="p-4"><ErrorState error={error} /></div> : isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : (data?.rows ?? []).length === 0 ? (
          <EmptyState icon={<History />} title={t('none')} />
        ) : (
          <ul className="divide-y divide-line">
            {data!.rows.map((r) => {
              const changes = diff(r);
              return (
                <li key={r.id}>
                  <button onClick={() => setOpen(r)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-sunken/40">
                    <Badge tone={tone(r.action)}>{r.action}</Badge>
                    <span className="font-mono text-[12px] text-ink-2">{r.table_name}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{changes.slice(0, 3).map(([k]) => k).join(', ')}</span>
                    <span className="text-[13px]">{r.actor_id ? L.personName(r.actor_id) : 'system'}</span>
                    <span className="text-[12px] text-ink-3">{dateTime(r.created_at)}</span>
                    {r.reason && <span className="w-full text-[12px] text-ink-2">“{r.reason}”</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} total={data?.count ?? 0} size={data?.size ?? 40} onPage={setPage} />
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={`${open?.action} · ${open?.table_name}`} description={open ? `${open.actor_id ? L.personName(open.actor_id) : 'system'} (${open.actor_role ?? '—'}) · ${dateTime(open.created_at)}` : ''} size="lg">
        {open && (
          <div className="space-y-3">
            {open.reason && <p className="rounded-[8px] bg-sunken p-3 text-[14px]">{t('reason')}: {open.reason}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-ink-3"><tr><th className="py-1 pr-3">Field</th><th className="py-1 pr-3">Before</th><th className="py-1">After</th></tr></thead>
                <tbody className="divide-y divide-line font-mono">
                  {diff(open).map(([k, a, b]) => (
                    <tr key={k}><td className="py-1.5 pr-3 text-ink-3">{k}</td><td className="py-1.5 pr-3 text-bad">{a === undefined ? '' : JSON.stringify(a)}</td><td className="py-1.5 text-good">{b === undefined ? '' : JSON.stringify(b)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
