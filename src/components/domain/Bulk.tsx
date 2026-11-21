import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/misc';
import { downloadCsv } from '@/lib/utils';

/** Multi-select state for a list. `ids` are the rows that can be selected right now. */
export function useSelection(ids: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const valid = useMemo(() => new Set(ids), [ids]);
  // keep only rows that are still in the list (after filtering, deleting…)
  const selected = useMemo(() => [...sel].filter((id) => valid.has(id)), [sel, valid]);
  const toggle = useCallback((id: string, on: boolean) => setSel((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; }), []);
  const setMany = useCallback((list: string[], on: boolean) => setSel((p) => { const n = new Set(p); for (const id of list) { if (on) n.add(id); else n.delete(id); } return n; }), []);
  const clear = useCallback(() => setSel(new Set()), []);
  const headerState = (visible: string[]): boolean | 'indeterminate' => {
    const k = visible.filter((id) => sel.has(id)).length;
    return k === 0 ? false : k === visible.length ? true : 'indeterminate';
  };
  return { selected, count: selected.length, has: (id: string) => sel.has(id) && valid.has(id), toggle, setMany, clear, headerState };
}
export type Selection = ReturnType<typeof useSelection>;

/** Checkbox for a table header: selects / clears every visible row. */
export function SelectAllBox({ s, visible }: { s: Selection; visible: string[] }) {
  const { t } = useI18n();
  if (!visible.length) return null;
  return <Checkbox checked={s.headerState(visible)} onCheckedChange={(v) => s.setMany(visible, v)} label={t('selectAll')} />;
}

export function RowBox({ s, id, label }: { s: Selection; id: string; label: string }) {
  return (
    <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} className="inline-grid place-items-center">
      <Checkbox checked={s.has(id)} onCheckedChange={(v) => s.toggle(id, v)} label={label} />
    </span>
  );
}

/** Floating bar shown while rows are selected. Put the action buttons in children. */
export function BulkBar({ s, summary, children }: { s: Selection; summary?: ReactNode; children: ReactNode }) {
  const { t, num } = useI18n();
  if (!s.count) return null;
  return (
    <div className="no-print sticky bottom-[76px] z-20 mt-4 md:bottom-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[16px] border border-white/10 bg-nav px-3 py-2.5 text-white shadow-[0_16px_36px_-14px_rgba(10,15,40,.6)] sm:px-4">
        <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10" aria-label={t('bulkClear')} onClick={s.clear}><X /></Button>
        <span className="num mr-auto text-[14px] font-semibold">{t('nSelected', { n: num(s.count) })}{summary ? <span className="font-normal text-white/70"> · {summary}</span> : null}</span>
        <div className="flex flex-wrap items-center gap-1.5 [&_button]:h-9">{children}</div>
      </div>
    </div>
  );
}

/** Small white/ghost action buttons that read well on the dark bar. */
export function BarButton({ onClick, children, danger, disabled }: { onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-colors disabled:opacity-40 [&_svg]:size-4 ' +
        (danger ? 'bg-[#E5484D] text-white hover:bg-[#d23c41]' : 'bg-white/10 text-white hover:bg-white/20')
      }
    >
      {children}
    </button>
  );
}

/** CSV of just the selected rows. */
export function exportSelected<T>(filename: string, rows: T[], columns: Array<[string, (r: T) => string | number | null | undefined]>) {
  downloadCsv(filename, [columns.map((c) => c[0]), ...rows.map((r) => columns.map((c) => c[1](r) ?? ''))]);
}
