import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { useI18n } from '@/i18n/I18nProvider';


const axis = { stroke: 'var(--color-ink-3)', fontSize: 12, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  const { money } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]">
      <div className="mb-1 font-medium text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num ml-auto pl-3 font-medium text-ink">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export interface MonthPoint {
  label: string;
  income: number;
  expenses: number;
  balance: number;
}

export function IncomeExpenseChart({ data, height = 240 }: { data: MonthPoint[]; height?: number }) {
  const { t, num } = useI18n();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={48} tickFormatter={(v) => num(v)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-sunken)' }} />
          <Bar dataKey="income" name={t('collected')} fill="var(--color-brand)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name={t('totalSpent')} fill="var(--color-brass)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceTrendChart({ data, height = 220 }: { data: MonthPoint[]; height?: number }) {
  const { t, num } = useI18n();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={48} tickFormatter={(v) => num(v)} />
          <ReferenceLine y={0} stroke="var(--color-line-strong)" />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="balance" name={t('closingBalance')} stroke="var(--color-brand)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--color-brand)' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { CategoryBars } from './CategoryBars';
