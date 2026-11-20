import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { useI18n } from '@/i18n/I18nProvider';
import { toBnDigits } from '@/lib/format';


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

/** Smooth income vs expense areas — green rising, red falling — as on the dashboard mockup. */
export function IncomeExpenseArea({ data, height = 230 }: { data: MonthPoint[]; height?: number }) {
  const { t, num, lang } = useI18n();
  const short = (v: number) => {
    if (Math.abs(v) < 1000) return num(v);
    const k = (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return lang === 'bn' ? toBnDigits(k) : k;
  };
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="ar-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-good)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--color-good)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ar-out" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-bad)" stopOpacity={0.22} />
              <stop offset="1" stopColor="var(--color-bad)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 4" />
          <XAxis dataKey="label" {...axis} dy={6} />
          <YAxis {...axis} tickFormatter={short} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-line-strong)' }} />
          <Area type="monotone" dataKey="income" name={t('income')} stroke="var(--color-good)" strokeWidth={2.5} fill="url(#ar-in)"
            dot={{ r: 4, fill: 'var(--color-good)', stroke: 'var(--color-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={1100} />
          <Area type="monotone" dataKey="expenses" name={t('expense')} stroke="var(--color-bad)" strokeWidth={2.5} fill="url(#ar-out)"
            dot={{ r: 4, fill: 'var(--color-bad)', stroke: 'var(--color-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={1100} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { CategoryBars } from './CategoryBars';
