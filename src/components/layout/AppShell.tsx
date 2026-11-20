import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { Bell, Globe, LogOut, Menu, Moon, Sun, UserRound, ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useNotifications, useSettings } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { RoleBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { NAV } from './nav';
import { Logo } from './Logo';
import { Footer } from './Footer';

export function AppShell() {
  const { role, profile } = useAuth();
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(role));
  const mobileItems = items.filter((n) => n.mobile);
  const loc = useLocation();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col overflow-hidden bg-nav text-white lg:flex">
        <Link to="/app" className="flex flex-col items-center gap-2 px-5 pt-7 pb-6 text-center">
          <Logo tone="white" className="h-14" />
          <div className="min-w-0">
            <div className="truncate text-[18px] font-bold tracking-[-0.01em]">{t('appName')}</div>
            <div className="truncate text-[12px] text-white/60">{settings?.class_name}</div>
          </div>
        </Link>
        <nav className="scrollbar-thin relative z-10 min-h-0 flex-1 space-y-1 overflow-y-auto px-3.5 pb-4" aria-label="Main">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/app'}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-[12px] px-3.5 text-[15px] font-medium transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-[#5B6CFF] to-[#6F5CF0] text-white shadow-[0_8px_20px_-8px_rgba(91,108,255,.8)]'
                    : 'text-white/70 hover:bg-white/8 hover:text-white',
                )
              }
            >
              <n.icon className="size-[19px]" aria-hidden />
              {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <div className="relative z-10 px-6 pb-3 text-center text-[13px] leading-snug text-white/70 italic [@media(max-height:860px)]:hidden">{t('sidebarMotto')}</div>
        <div className="relative z-10 px-3.5 pb-4">
          <Link to="/" className="flex h-10 items-center gap-2 rounded-[12px] px-3.5 text-[13px] text-white/70 hover:bg-white/8 hover:text-white">
            <ExternalLink className="size-4" /> {t('navPublic')}
          </Link>
        </div>
        {/* soft waves at the foot of the sidebar */}
        <svg aria-hidden viewBox="0 0 248 140" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-36 w-full">
          <path d="M0 60c40-30 90-30 130-8s80 22 118-6v94H0z" fill="#1D2F66" fillOpacity=".7" />
          <path d="M0 92c50-26 100-18 140 2s70 14 108-6v52H0z" fill="#25397A" fillOpacity=".6" />
        </svg>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar onMenu={() => setMoreOpen(true)} />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-10" key={loc.pathname}>
          <Outlet />
          <Footer compact className="mt-10" />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {mobileItems.slice(0, 4).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/app'}
              className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-brand' : 'text-ink-3')}
            >
              <n.icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-1">{t(n.label)}</span>
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-3">
            <Menu className="size-5" aria-hidden />
            {t('navMore')}
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title={t('navMore')}>
        <div className="grid grid-cols-3 gap-2 pb-3">
          {items.filter((n) => !n.mobile).concat({ to: '/app/profile', label: 'navProfile', icon: UserRound, roles: [] }).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) => cn('flex flex-col items-center gap-2 rounded-[12px] border border-line p-3 text-center text-[12px] font-medium', isActive ? 'border-brand bg-brand-soft text-brand' : 'text-ink-2')}
            >
              <n.icon className="size-5" />
              {t(n.label)}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line py-3">
          <Avatar name={profile?.full_name || profile?.email || '?'} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{profile?.full_name}</div>
            <div className="truncate text-[12px] text-ink-3">{profile?.email}</div>
          </div>
          <RoleBadge role={role} />
        </div>
      </Dialog>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { profile, role, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line/70 bg-paper/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Link to="/app" className="flex items-center gap-2 lg:hidden">
        <Logo small className="h-6" />
        <span className="text-[15px] font-semibold">{t('appName')}</span>
      </Link>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} aria-label="Switch language">
        <Globe /> <span className="hidden sm:inline">{t('language')}</span>
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}>
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <NotificationBell />
      <DM.Root>
        <DM.Trigger asChild>
          <button className="hidden items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-sunken sm:flex" aria-label={t('navProfile')}>
            <Avatar name={profile?.full_name || profile?.email || '?'} className="size-9" />
            <span className="max-w-[160px] truncate text-[14px] font-semibold">{profile?.full_name || profile?.email}</span>
          </button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={6} className="z-50 min-w-[220px] rounded-[12px] border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]">
            <div className="px-2.5 py-2">
              <div className="text-[13px] font-medium">{profile?.full_name}</div>
              <div className="text-[12px] text-ink-3">{profile?.email}</div>
              <div className="mt-1.5"><RoleBadge role={role} /></div>
            </div>
            <DM.Separator className="my-1 h-px bg-line" />
            <DM.Item onSelect={() => navigate('/app/profile')} className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[14px] outline-none data-[highlighted]:bg-sunken">
              <UserRound className="size-4" /> {t('navProfile')}
            </DM.Item>
            <DM.Item onSelect={() => signOut().then(() => navigate('/login'))} className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[14px] text-bad outline-none data-[highlighted]:bg-bad-soft">
              <LogOut className="size-4" /> {t('signOut')}
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      <Button variant="ghost" size="icon-sm" className="sm:hidden" onClick={onMenu} aria-label={t('navMore')}>
        <Menu />
      </Button>
    </header>
  );
}

function NotificationBell() {
  const { t, lang, dateTime } = useI18n();
  const { data } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unread = (data ?? []).filter((n) => !n.read_at);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={t('notifications')}>
          <Bell />
          {unread.length > 0 && (
            <span className="num absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-[18px] text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(92vw,360px)] rounded-[14px] border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[14px] font-semibold">{t('notifications')}</span>
            {unread.length > 0 && (
              <button className="text-[12px] font-medium text-brand hover:underline" onClick={() => markRead(unread.map((n) => n.id))}>
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {(data ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-3">{t('noNotifications')}</p>
            ) : (
              (data ?? []).map((n) => (
                <Popover.Close asChild key={n.id}>
                  <button
                    onClick={() => {
                      markRead([n.id]);
                      if (n.link) navigate(n.link);
                    }}
                    className={cn('flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-sunken', !n.read_at && 'bg-brand-soft/40')}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{lang === 'bn' ? n.title_bn : n.title_en}</span>
                      {(n.body_en || n.body_bn) && <span className="block truncate text-[12px] text-ink-3">{lang === 'bn' ? n.body_bn : n.body_en}</span>}
                      <span className="mt-0.5 block text-[11px] text-ink-3">{dateTime(n.created_at)}</span>
                    </span>
                  </button>
                </Popover.Close>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
