import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { callAdminUsers, supabase } from '@/lib/supabase';
import { useNeedsBootstrap } from '@/lib/queries';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { PageSkeleton } from '@/components/ui/misc';
import { AuthLayout } from './AuthLayout';

const schema = z
  .object({
    full_name: z.string().trim().min(2),
    email: z.string().trim().email(),
    password: z.string().min(8).max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });

export default function Setup() {
  const { t, pick } = useI18n();
  const nav = useNavigate();
  const { data: needs, isLoading } = useNeedsBootstrap();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (isLoading) return <div className="p-8"><PageSkeleton /></div>;
  if (needs === false) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError('');
    try {
      await callAdminUsers({ action: 'bootstrap', email: v.email, password: v.password, full_name: v.full_name });
      toast.success(t('setupDone'));
      await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
      nav('/app', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  const e = formState.errors;
  return (
    <AuthLayout title={t('setupTitle')} body={t('setupBody')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('fullName')} htmlFor="n" error={e.full_name && t('required')}>
          <Input id="n" autoComplete="name" {...register('full_name')} />
        </Field>
        <Field label={t('email')} htmlFor="e" error={e.email && pick('Enter a valid email', 'সঠিক ইমেইল দিন')}>
          <Input id="e" type="email" autoComplete="username" {...register('email')} />
        </Field>
        <Field label={t('password')} htmlFor="p" error={e.password && pick('8 to 72 characters', '৮ থেকে ৭২ অক্ষর')}>
          <Input id="p" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label={pick('Repeat password', 'পাসওয়ার্ড আবার লিখুন')} htmlFor="c" error={e.confirm && pick('Passwords do not match', 'পাসওয়ার্ড মেলেনি')}>
          <Input id="c" type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        {error && <p className="rounded-[8px] bg-bad-soft px-3 py-2 text-[13px] text-bad" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>{t('createAccount')}</Button>
      </form>
    </AuthLayout>
  );
}
