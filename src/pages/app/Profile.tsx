import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/I18nProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { RoleBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/misc';

export default function Profile() {
  const { t, pick } = useI18n();
  const { profile, role, signOut } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState<'p' | 'w' | null>(null);
  useEffect(() => { setName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); }, [profile]);

  const saveProfile = async () => {
    setBusy('p');
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', profile!.id);
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success(t('saved'));
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['profiles'] });
  };
  const savePw = async () => {
    setBusy('w');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    setPw(''); setPw2('');
    toast.success(t('passwordChanged'));
  };

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title={t('navProfile')} description={profile?.email} actions={<RoleBadge role={role} />} />
      <Card>
        <CardHeader title={t('details')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fullName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('phone')}><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
          <div className="sm:col-span-2"><Button loading={busy === 'p'} disabled={name.trim().length < 2} onClick={saveProfile}>{t('saveChanges')}</Button></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('changePassword')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('newPassword')} hint={pick('At least 8 characters', 'কমপক্ষে ৮ অক্ষর')}><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label={pick('Repeat password', 'পাসওয়ার্ড আবার লিখুন')} error={pw2 && pw !== pw2 ? pick('Passwords do not match', 'পাসওয়ার্ড মেলেনি') : undefined}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button loading={busy === 'w'} disabled={pw.length < 8 || pw !== pw2} onClick={savePw}>{t('changePassword')}</Button></div>
        </CardBody>
      </Card>
      <Button variant="danger-ghost" onClick={signOut}>{t('signOut')}</Button>
    </div>
  );
}
