import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase';
import type { Role } from '@/lib/types';
import { AppShell } from '@/components/layout/AppShell';
import { PageSkeleton } from '@/components/ui/misc';
import { PendingAccess } from '@/pages/auth/PendingAccess';
import { useI18n } from '@/i18n/I18nProvider';

const PublicDashboard = lazy(() => import('@/pages/public/PublicDashboard'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Setup = lazy(() => import('@/pages/auth/Setup'));
const Dashboard = lazy(() => import('@/pages/app/Dashboard'));
const Months = lazy(() => import('@/pages/app/Months'));
const MonthDetail = lazy(() => import('@/pages/app/MonthDetail'));
const Payments = lazy(() => import('@/pages/app/Payments'));
const Students = lazy(() => import('@/pages/app/Students'));
const StudentProfile = lazy(() => import('@/pages/app/StudentProfile'));
const Expenses = lazy(() => import('@/pages/app/Expenses'));
const Handovers = lazy(() => import('@/pages/app/Handovers'));
const Collectors = lazy(() => import('@/pages/app/Collectors'));
const Birthdays = lazy(() => import('@/pages/app/Birthdays'));
const Reports = lazy(() => import('@/pages/app/Reports'));
const Users = lazy(() => import('@/pages/app/Users'));
const Settings = lazy(() => import('@/pages/app/Settings'));
const AuditLog = lazy(() => import('@/pages/app/AuditLog'));
const Profile = lazy(() => import('@/pages/app/Profile'));

function RequireStaff({ children }: { children: ReactNode }) {
  const { session, ready, role, profileLoading } = useAuth();
  const loc = useLocation();
  if (!ready || profileLoading) return <div className="p-8"><PageSkeleton /></div>;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (role === 'pending') return <PendingAccess />;
  return <>{children}</>;
}

/** Hides screens a role has no use for. The database enforces the real rules. */
function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role } = useAuth();
  return roles.includes(role) ? <>{children}</> : <Navigate to="/app" replace />;
}

const MANAGERS: Role[] = ['admin', 'treasurer', 'auditor'];

export function App() {
  const { t } = useI18n();
  if (!supabaseConfigured) {
    return <div className="mx-auto max-w-lg p-8 text-center text-ink-2">{t('notConfigured')}</div>;
  }
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/" element={<PublicDashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route
            path="/app"
            element={
              <RequireStaff>
                <AppShell />
              </RequireStaff>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="months" element={<Months />} />
            <Route path="months/:id" element={<MonthDetail />} />
            <Route path="payments" element={<Payments />} />
            <Route path="students" element={<Students />} />
            <Route path="students/:id" element={<StudentProfile />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="handovers" element={<Handovers />} />
            <Route path="collectors" element={<Only roles={MANAGERS}><Collectors /></Only>} />
            <Route path="birthdays" element={<Birthdays />} />
            <Route path="reports" element={<Only roles={MANAGERS}><Reports /></Only>} />
            <Route path="users" element={<Only roles={['admin']}><Users /></Only>} />
            <Route path="audit" element={<Only roles={MANAGERS}><AuditLog /></Only>} />
            <Route path="settings" element={<Only roles={['admin']}><Settings /></Only>} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
