import type { Lang } from '@/i18n/strings';

export const TZ = 'Asia/Dhaka';
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBnDigits(s: string): string {
  return s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function num(n: number | null | undefined, lang: Lang): string {
  const v = Number(n ?? 0);
  // en-IN grouping (1,00,000) is how Bangladesh writes taka amounts
  const s = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v);
  return lang === 'bn' ? toBnDigits(s) : s;
}

export function money(n: number | null | undefined, lang: Lang): string {
  const v = Number(n ?? 0);
  const sign = v < 0 ? '−' : '';
  return `${sign}৳${num(Math.abs(v), lang)}`;
}

/** Today's date in Asia/Dhaka as YYYY-MM-DD */
export function dhakaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function dhakaNowParts() {
  const [y, m, d] = dhakaToday().split('-').map(Number);
  return { year: y, month: m, day: d };
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

export function monthName(m: number, lang: Lang, short = false): string {
  const name = (lang === 'bn' ? MONTHS_BN : MONTHS_EN)[m - 1] ?? '';
  return short && lang === 'en' ? name.slice(0, 3) : name;
}

/** Format a plain date (YYYY-MM-DD) without timezone shifting. */
export function dateStr(iso: string | null | undefined, lang: Lang, withYear = true): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const out = lang === 'bn'
    ? `${toBnDigits(String(d))} ${monthName(m, 'bn')}${withYear ? ' ' + toBnDigits(String(y)) : ''}`
    : `${d} ${monthName(m, 'en', true)}${withYear ? ' ' + y : ''}`;
  return out;
}

/** Format a timestamp in Dhaka time. */
export function dateTimeStr(ts: string | null | undefined, lang: Lang): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const datePart = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  const t = lang === 'bn' ? toBnDigits(time.replace('am', 'AM').replace('pm', 'PM')) : time.toUpperCase();
  return `${dateStr(datePart, lang)}, ${t}`;
}

export function monthTitle(m: { title_en: string; title_bn: string }, lang: Lang) {
  return lang === 'bn' ? m.title_bn : m.title_en;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

/** Days from today (Dhaka) until the next occurrence of a birthday (0 = today). Feb 29 → Feb 28 in common years. */
export function daysUntilBirthday(birthdate: string, today = dhakaToday()): number {
  const [ty, tm, td] = today.split('-').map(Number);
  const [, bm, bd] = birthdate.split('-').map(Number);
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const occ = (y: number) => {
    const day = bm === 2 && bd === 29 && !isLeap(y) ? 28 : bd;
    return Date.UTC(y, bm - 1, day);
  };
  const t = Date.UTC(ty, tm - 1, td);
  let next = occ(ty);
  if (next < t) next = occ(ty + 1);
  return Math.round((next - t) / 86400000);
}

export function ageOn(birthdate: string, today = dhakaToday()): number {
  const [ty, tm, td] = today.split('-').map(Number);
  const [by, bm, bd] = birthdate.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
}
