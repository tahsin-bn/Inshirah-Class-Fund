import { cn } from '@/lib/utils';

/** Three rising ledger bars and a brass coin: the fund growing month by month. */
export function Logo({ small, className }: { small?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn(small ? 'size-7' : 'size-9', 'shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="15" fill="var(--color-brand)" />
      <path d="M18 44h28M22 44V30m10 14V22m10 22V33" stroke="var(--color-brand-ink)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="46" cy="19" r="5" fill="var(--color-brass)" />
    </svg>
  );
}
