import { cn } from '@/lib/utils';

/**
 * The Inshirah 19 kufic mark. It is wide (about 2.5 : 1), so size it by height.
 * tone="auto" shows navy on light backgrounds and white in dark mode;
 * tone="white" is for dark surfaces such as the sidebar.
 */
export function Logo({ small, className, tone = 'auto', full }: { small?: boolean; className?: string; tone?: 'auto' | 'white'; full?: boolean }) {
  const base = full ? '/brand/logo-full' : '/brand/logo-mark';
  const h = cn(full ? 'h-auto w-full' : small ? 'h-7 w-auto' : 'h-9 w-auto', 'shrink-0 select-none', className);
  if (tone === 'white') return <img src={`${base}-white.png`} alt="Inshirah 19" className={h} draggable={false} />;
  return (
    <>
      <img src={`${base}.png`} alt="Inshirah 19" className={cn(h, 'dark:hidden')} draggable={false} />
      <img src={`${base}-white.png`} alt="" aria-hidden className={cn(h, 'hidden dark:block')} draggable={false} />
    </>
  );
}
