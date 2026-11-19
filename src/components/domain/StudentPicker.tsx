import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Student } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import { Input } from '@/components/ui/form';

/** Type-ahead list for picking a student by roll or name. */
export function StudentPicker({ students, value, onChange, extra }: { students: Student[]; value: string; onChange: (id: string) => void; extra?: (s: Student) => React.ReactNode }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return students
      .filter((x) => x.status === 'active')
      .filter((x) => !s || x.roll.toLowerCase().includes(s) || x.name.toLowerCase().includes(s))
      .slice(0, 60);
  }, [q, students]);
  return (
    <div className="rounded-[10px] border border-line-strong">
      <div className="relative border-b border-line">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pickStudent')} className="border-0 pl-9 focus:ring-0" aria-label={t('pickStudent')} />
      </div>
      <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
        {list.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-ink-3">{t('noResults')}</li>}
        {list.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={value === s.id}
              onClick={() => onChange(s.id)}
              className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] hover:bg-sunken', value === s.id && 'bg-brand-soft')}
            >
              <span className="num w-12 shrink-0 font-medium text-ink-3">{s.roll}</span>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {extra?.(s)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
