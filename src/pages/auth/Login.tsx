import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useNeedsBootstrap } from '@/lib/queries';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export default function Login() {
  const { t, pick } = useI18n();
  const { session, ready } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState('');
  const { data: needsSetup } = useNeedsBootstrap();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (ready && session) return <Navigate to={(loc.state as { from?: string })?.from ?? '/app'} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(/invalid/i.test(error.message) ? t('badLogin') : error.message);
      return;
    }
    nav((loc.state as { from?: string })?.from ?? '/app', { replace: true });
  });

  return (
    <AuthLayout title={t('signInTitle')} body={t('signInBody')}>
      {needsSetup && (
        <div className="mb-5 rounded-[10px] border border-brass/40 bg-brass-soft p-3 text-[13px] text-ink-2">
          {pick('No admin exists yet.', 'এখনো কোনো অ্যাডমিন নেই।')}{' '}
          <Link to="/setup" className="font-medium text-brand underline-offset-4 hover:underline">{t('setupTitle')}</Link>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('email')} htmlFor="email" error={formState.errors.email && pick('Enter a valid email', 'সঠিক ইমেইল দিন')}>
          <Input id="email" type="email" autoComplete="username" autoFocus {...register('email')} aria-invalid={!!formState.errors.email} />
        </Field>
        <Field label={t('password')} htmlFor="password" hint={t('forgotHint')}>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        {error && (
          <p className="flex items-center gap-2 rounded-[8px] bg-bad-soft px-3 py-2 text-[13px] text-bad" role="alert">
            <AlertTriangle className="size-4" /> {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>{t('signIn')}</Button>
      </form>
      <Link to="/" className="mt-6 block text-center text-[13px] text-ink-3 hover:text-ink">← {t('navPublic')}</Link>
    </AuthLayout>
  );
}
