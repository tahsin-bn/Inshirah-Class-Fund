import { useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { callAdminUsers, rpc } from '@/lib/supabase';
import { useAction, useProfiles, useSettings } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { STAFF_ROLES, type Profile, type Role } from '@/lib/types';
import { useI18n } from '@/i18n/I18nProvider';
import type { StringKey } from '@/i18n/strings';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Badge, RoleBadge } from '@/components/ui/badge';
import { Avatar, PageHeader, PageSkeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

const ROLE_HELP: Record<Role, [string, string]> = {
  admin: ['Everything, including users, roles and settings.', 'সবকিছু, ব্যবহারকারী, ভূমিকা ও সেটিংস সহ।'],
  treasurer: ['Payments, expense approvals, handovers, waivers and reports.', 'পেমেন্ট, খরচ অনুমোদন, হ্যান্ডওভার, মওকুফ ও রিপোর্ট।'],
  collector: ['Collects from assigned students and hands cash to the treasury.', 'নির্ধারিত শিক্ষার্থীদের কাছ থেকে চাঁদা তুলে কোষাগারে জমা দেয়।'],
  auditor: ['Read-only access to every record, report and the audit log.', 'সব রেকর্ড, রিপোর্ট ও অডিট লগ শুধু দেখতে পারে।'],
  pending: ['No access until a role is given.', 'ভূমিকা না দেওয়া পর্যন্ত কোনো প্রবেশাধিকার নেই।'],
};

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export default function Users() {
  const { t, pick, date } = useI18n();
  const { session } = useAuth();
  const { data, isLoading } = useProfiles();
  const { data: settings } = useSettings();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [resetting, setResetting] = useState<Profile | null>(null);
  if (isLoading) return <PageSkeleton />;
  const users = data ?? [];
  const collectors = users.filter((u) => u.role === 'collector' && u.is_active).length;

  return (
    <div className="space-y-5">
      <PageHeader title={t('navUsers')} description={t('collectorLimit', { n: collectors, m: settings?.max_collectors ?? 10 })} actions={<Button onClick={() => setAdding(true)}><UserPlus />{t('addUser')}</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAFF_ROLES.map((r) => (
          <Card key={r} className="p-4">
            <div className="flex items-center justify-between"><RoleBadge role={r} /><span className="num text-[18px] font-semibold">{users.filter((u) => u.role === r && u.is_active).length}</span></div>
            <p className="mt-2 text-[13px] text-ink-3">{pick(...ROLE_HELP[r])}</p>
          </Card>
        ))}
      </div>
      <Card>
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const me = u.id === session?.user.id;
            return (
              <li key={u.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap', !u.is_active && 'opacity-60')}>
                <Avatar name={u.full_name || u.email} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{u.full_name || '—'} {me && <span className="text-ink-3">({t('you')})</span>}</div>
                  <div className="truncate text-[12px] text-ink-3">{u.email} · {date(u.created_at.slice(0, 10))}</div>
                </div>
                {!u.is_active && <Badge>{t('st_inactive')}</Badge>}
                <RoleBadge role={u.role} />
                {!me && (
                  <div className="flex w-full justify-end gap-1 sm:w-auto">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(u)}><ShieldCheck />{t('changeRole')}</Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t('resetPassword')} onClick={() => setResetting(u)}><KeyRound /></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <AddUserDialog open={adding} onOpenChange={setAdding} />
      <RoleDialog user={editing} onClose={() => setEditing(null)} />
      <ResetDialog user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, pick } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: '', email: '', role: 'collector' as Role, password: tempPassword() });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const valid = f.full_name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) && f.password.length >= 8;
  const submit = async () => {
    setBusy(true);
    try {
      await callAdminUsers({ action: 'create', ...f, email: f.email.trim() });
      qc.invalidateQueries({ queryKey: ['profiles'] });
      toast.success(t('saved'));
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setF({ full_name: '', email: '', role: 'collector', password: tempPassword() }); setDone(false); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())} title={t('addUser')}
      footer={done ? <Button onClick={close}>{t('close')}</Button> : <><Button variant="secondary" onClick={close}>{t('cancel')}</Button><Button disabled={!valid} loading={busy} onClick={submit}>{t('createAccount')}</Button></>}>
      {done ? (
        <div className="space-y-3 text-[14px]">
          <p>{pick('Account created. Share these details privately:', 'অ্যাকাউন্ট তৈরি হয়েছে। এই তথ্য গোপনে জানান:')}</p>
          <div className="rounded-[10px] bg-sunken p-3 font-mono text-[13px]"><div>{f.email}</div><div>{f.password}</div></div>
          <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(`${f.email}\n${f.password}`).then(() => toast.success(pick('Copied', 'কপি হয়েছে')))}>{pick('Copy', 'কপি')}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t('fullName')}><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label={t('email')}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t('role')} hint={pick(...ROLE_HELP[f.role])}>
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}` as StringKey)}</option>)}</Select>
          </Field>
          <Field label={t('tempPassword')} hint={t('tempPasswordHint')}>
            <div className="flex gap-2"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="font-mono" /><Button variant="secondary" onClick={() => setF({ ...f, password: tempPassword() })}>↻</Button></div>
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function RoleDialog({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const { t, pick } = useI18n();
  const [role, setRole] = useState<Role>('collector');
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState('');
  const [last, setLast] = useState<string | null>(null);
  if (user && user.id !== last) { setLast(user.id); setRole(user.role); setActive(user.is_active); setReason(''); }
  const save = useAction(() => rpc('set_user_role', { p_user: user!.id, p_role: role, p_active: active, p_reason: reason || null }), { success: t('saved'), extraKeys: ['profiles', 'assignments'] });
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { onClose(); setLast(null); } }} title={t('changeRole')} description={user?.email} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button loading={save.isPending} onClick={async () => { await save.mutateAsync(undefined).catch(() => {}); onClose(); setLast(null); }}>{t('save')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('role')} hint={pick(...ROLE_HELP[role])}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>{[...STAFF_ROLES, 'pending' as Role].map((r) => <option key={r} value={r}>{t(`role_${r}` as StringKey)}</option>)}</Select>
        </Field>
        {user?.role === 'collector' && role !== 'collector' && <p className="rounded-[8px] bg-warn-soft p-2 text-[13px] text-warn">{pick('Their students will become unassigned.', 'তাদের শিক্ষার্থীরা অনির্ধারিত হয়ে যাবে।')}</p>}
        <Field label={t('status')}>
          <Select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}><option value="1">{t('st_active')}</option><option value="0">{t('st_inactive')}</option></Select>
        </Field>
        <Field label={<>{t('reason')} <span className="text-ink-3">({t('optional')})</span></>}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const { t, pick } = useI18n();
  const [pw, setPw] = useState(tempPassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { onClose(); setDone(false); setPw(tempPassword()); } }} title={t('resetPassword')} description={user?.email} size="sm"
      footer={done ? <Button onClick={() => { onClose(); setDone(false); }}>{t('close')}</Button> : <><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button loading={busy} disabled={pw.length < 8} onClick={async () => {
        setBusy(true);
        try { await callAdminUsers({ action: 'reset_password', user_id: user!.id, password: pw }); setDone(true); toast.success(t('saved')); }
        catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); }
      }}>{t('resetPassword')}</Button></>}>
      {done ? (
        <div className="space-y-2 text-[14px]"><p>{pick('New temporary password:', 'নতুন অস্থায়ী পাসওয়ার্ড:')}</p><div className="rounded-[10px] bg-sunken p-3 font-mono">{pw}</div><p className="text-ink-3">{t('tempPasswordHint')}</p></div>
      ) : (
        <Field label={t('tempPassword')} hint={t('tempPasswordHint')}><div className="flex gap-2"><Input value={pw} onChange={(e) => setPw(e.target.value)} className="font-mono" /><Button variant="secondary" onClick={() => setPw(tempPassword())}>↻</Button></div></Field>
      )}
    </Dialog>
  );
}
