import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';

export function PendingAccess() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();
  return (
    <AuthLayout title={t('pendingTitle')} body={t('pendingBody')}>
      <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-4">
        <Clock className="size-5 text-warn" />
        <div className="text-[14px]">
          <div className="font-medium">{profile?.full_name || profile?.email}</div>
          <div className="text-ink-3">{profile?.email}</div>
        </div>
      </div>
      <Button variant="secondary" className="mt-4 w-full" onClick={signOut}>{t('signOut')}</Button>
    </AuthLayout>
  );
}
