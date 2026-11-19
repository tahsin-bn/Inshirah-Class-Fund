import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('print-card rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]', className)} {...p} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...p} />;
}

/** A single figure with its label. `tone` colours the value only. */
export function Stat({
  label, value, sub, tone = 'ink', icon, className,
}: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'ink' | 'good' | 'bad' | 'warn' | 'brand'; icon?: ReactNode; className?: string }) {
  const toneCls = { ink: 'text-ink', good: 'text-good', bad: 'text-bad', warn: 'text-warn', brand: 'text-brand' }[tone];
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between gap-2 text-[13px] text-ink-3">
        <span>{label}</span>
        {icon && <span className="text-ink-3 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className={cn('num mt-2 text-[22px] font-semibold tracking-tight', toneCls)}>{value}</div>
      {sub && <div className="mt-1 text-[13px] text-ink-3">{sub}</div>}
    </Card>
  );
}
