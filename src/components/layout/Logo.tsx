import { useId } from 'react';
import { cn } from '@/lib/utils';

/** A graduation cap over a rising bar: the class and its fund growing together. */
export function Logo({ small, className }: { small?: boolean; className?: string }) {
  // a unique gradient id per logo: a shared id breaks when the first copy is hidden (e.g. the desktop sidebar on phones)
  const gid = `logo-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={cn(small ? 'size-8' : 'size-10', 'shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B6CFF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <path d="M32 15 9 25l23 10 23-10z" fill="#fff" />
      <path d="M19 30v9c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5v-9l-13 5.7z" fill="#fff" fillOpacity=".78" />
      <path d="M50 26v12" stroke="#FFD27A" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="50" cy="40" r="2.6" fill="#FFD27A" />
    </svg>
  );
}
