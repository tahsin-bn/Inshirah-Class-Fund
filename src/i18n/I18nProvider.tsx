import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STRINGS, type Lang, type StringKey } from './strings';
import { money, num, dateStr, dateTimeStr, monthTitle, toBnDigits } from '@/lib/format';

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  money: (n: number | null | undefined) => string;
  num: (n: number | null | undefined) => string;
  year: (n: number) => string;
  date: (iso: string | null | undefined, withYear?: boolean) => string;
  dateTime: (ts: string | null | undefined) => string;
  month: (m: { title_en: string; title_bn: string }) => string;
  pick: (en: string, bn: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem('icf-lang') === 'en' ? 'en' : 'bn';
    } catch {
      return 'bn';
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('icf-lang', lang);
    } catch {
      /* storage unavailable */
    }
  }, [lang]);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const pair = STRINGS[key];
      let s: string = pair ? pair[lang === 'en' ? 0 : 1] : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          const val = typeof v === 'number' ? num(v, lang) : v;
          s = s.replaceAll(`{${k}}`, val);
        }
      }
      return s;
    },
    [lang],
  );

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang: setLangState,
      t,
      money: (n) => money(n, lang),
      num: (n) => num(n, lang),
      year: (n) => (lang === 'bn' ? toBnDigits(String(n)) : String(n)),
      date: (iso, withYear = true) => dateStr(iso, lang, withYear),
      dateTime: (ts) => dateTimeStr(ts, lang),
      month: (m) => monthTitle(m, lang),
      pick: (en, bn) => (lang === 'en' ? en : bn),
    }),
    [lang, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be inside I18nProvider');
  return v;
}
