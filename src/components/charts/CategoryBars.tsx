import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';

/** Horizontal share bars — easier to read than a pie on a phone. */
export function CategoryBars({ items, className }: { items: { name: string; amount: number }[]; className?: string }) {
  const { money } = useI18n();
  const total = items.reduce((s, i) => s + i.amount, 0);
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  return (
    <ul className={cn('space-y-3', className)}>
      {sorted.map((i, idx) => {
        const share = total ? (i.amount / total) * 100 : 0;
        return (
          <li key={i.name}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink-2">{i.name}</span>
              <span className="num shrink-0 font-medium text-ink">{money(i.amount)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full"
                style={{ width: `${share}%`, background: idx === 0 ? 'var(--color-brass)' : 'color-mix(in oklab, var(--color-brand) 70%, transparent)' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
