import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'brand' | 'brass';

const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-soft text-brand',
  brass: 'bg-brass-soft text-brass',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  paid: 'good', partial: 'warn', unpaid: 'bad', waived: 'info',
  pending: 'warn', approved: 'good', rejected: 'bad', void: 'neutral', confirmed: 'good',
  open: 'brand', closed: 'neutral', active: 'good', archived: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>
      {t(`st_${status}` as StringKey)}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n();
  const tone: Tone = role === 'admin' ? 'brand' : role === 'treasurer' ? 'brass' : role === 'collector' ? 'info' : role === 'auditor' ? 'neutral' : 'warn';
  return <Badge tone={tone}>{t(`role_${role}` as StringKey)}</Badge>;
}
