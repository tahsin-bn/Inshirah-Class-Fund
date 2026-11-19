import type { ReactNode } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-sunken', className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold text-ink sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-[14px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, action, className }: { icon?: ReactNode; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon && <div className="grid size-12 place-items-center rounded-full bg-sunken text-ink-3 [&_svg]:size-5">{icon}</div>}
      <p className="max-w-sm text-[14px] text-ink-2">{title}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-bad/30 bg-bad-soft p-4 text-[14px] text-bad" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {onRetry && (
          <Button variant="link" className="mt-1 text-bad" onClick={onRetry}>{t('retry')}</Button>
        )}
      </div>
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </span>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-brand disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </label>
  );
}

export function Checkbox({ checked, onCheckedChange, label, className }: { checked: boolean | 'indeterminate'; onCheckedChange: (v: boolean) => void; label?: string; className?: string }) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      className={cn('grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-surface data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand', className)}
    >
      <CheckboxPrimitive.Indicator className="text-brand-ink">
        {checked === 'indeterminate' ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand', className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Pagination({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3">
      <span>{t('pageOf', { a: page + 1, b: pages })}</span>
      <div className="flex gap-1">
        <Button variant="secondary" size="icon-sm" aria-label={t('prev')} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
        <Button variant="secondary" size="icon-sm" aria-label={t('next')} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
      </div>
    </div>
  );
}

/** Segmented control used for small filters. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  const { num } = useI18n();
  return (
    <div className={cn('scrollbar-thin flex gap-1 overflow-x-auto rounded-[10px] bg-sunken p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="num text-ink-3">{num(o.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/** Thin progress bar. */
export function Progress({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'good' | 'warn' | 'brass'; className?: string }) {
  const bg = { brand: 'bg-brand', good: 'bg-good', warn: 'bg-warn', brass: 'bg-brass' }[tone];
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-sunken', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', bg)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
