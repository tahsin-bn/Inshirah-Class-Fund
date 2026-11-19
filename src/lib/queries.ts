import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rpc, supabase, errorMessage } from './supabase';
import { useAuth } from './auth';
import type {
  Assignment, AuditLog, CollectorSummary, Expense, ExpenseCategory, FundMonth, Handover, LedgerRow,
  NotificationRow, OtherIncome, Payment, Profile, PublicDashboard, Settings, Student, StudentMonthStatus,
  TreasuryPosition, Waiver,
} from './types';

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

// ---------------------------------------------------------------- public
export function usePublicDashboard() {
  return useQuery({
    queryKey: ['public-dashboard'],
    staleTime: 60_000,
    queryFn: () => rpc<PublicDashboard>('get_public_dashboard'),
  });
}

export function useNeedsBootstrap() {
  return useQuery({ queryKey: ['needs-bootstrap'], staleTime: 30_000, queryFn: () => rpc<boolean>('needs_bootstrap') });
}

// ---------------------------------------------------------------- reference data
export function useSettings() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['settings'],
    enabled: role !== 'pending',
    staleTime: 5 * 60_000,
    queryFn: () => rows<Settings>(supabase.from('app_settings').select('*').single()),
  });
}

export function useMonths() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['months'],
    enabled: role !== 'pending',
    staleTime: 60_000,
    queryFn: () => rows<FundMonth[]>(supabase.from('fund_months').select('*').order('year', { ascending: false }).order('month', { ascending: false })),
  });
}

export function useLedger() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['ledger'],
    enabled: role !== 'pending',
    staleTime: 30_000,
    queryFn: () => rpc<LedgerRow[]>('get_month_ledger'),
  });
}

export function useTreasury() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['treasury'],
    enabled: can('admin', 'treasurer', 'auditor'),
    staleTime: 30_000,
    queryFn: () => rpc<TreasuryPosition>('get_treasury_position'),
  });
}

export function useStudents() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['students'],
    enabled: role !== 'pending',
    staleTime: 60_000,
    queryFn: () => rows<Student[]>(supabase.from('students').select('*').order('roll')),
  });
}

export function useAssignments() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['assignments'],
    enabled: role !== 'pending',
    staleTime: 60_000,
    queryFn: () => rows<Assignment[]>(supabase.from('student_collector_assignments').select('*').is('unassigned_at', null)),
  });
}

export function useProfiles() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['profiles'],
    enabled: role !== 'pending',
    staleTime: 60_000,
    queryFn: () => rows<Profile[]>(supabase.from('profiles').select('*').order('full_name')),
  });
}

export function useCategories() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['categories'],
    enabled: role !== 'pending',
    staleTime: 5 * 60_000,
    queryFn: () => rows<ExpenseCategory[]>(supabase.from('expense_categories').select('*').order('sort_order')),
  });
}

export function useCollectorSummaries() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['collector-summaries'],
    enabled: role !== 'pending',
    staleTime: 30_000,
    queryFn: () => rpc<CollectorSummary[]>('get_collector_summaries'),
  });
}

// ---------------------------------------------------------------- transactional data
export function useMonthStatuses(monthId: string | undefined) {
  return useQuery({
    queryKey: ['statuses', monthId],
    enabled: !!monthId,
    staleTime: 15_000,
    queryFn: () => rows<StudentMonthStatus[]>(supabase.from('v_student_month_status').select('*').eq('month_id', monthId!)),
  });
}

export function useStudentStatuses(studentId: string | undefined) {
  return useQuery({
    queryKey: ['statuses-student', studentId],
    enabled: !!studentId,
    queryFn: () => rows<StudentMonthStatus[]>(supabase.from('v_student_month_status').select('*').eq('student_id', studentId!)),
  });
}

export interface PaymentFilter {
  monthId?: string;
  studentId?: string;
  collectorId?: string;
  page?: number;
  pageSize?: number;
}

export function usePayments(f: PaymentFilter = {}) {
  const page = f.page ?? 0;
  const size = f.pageSize ?? 50;
  return useQuery({
    queryKey: ['payments', f],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase.from('payments').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (f.monthId) q = q.eq('month_id', f.monthId);
      if (f.studentId) q = q.eq('student_id', f.studentId);
      if (f.collectorId) q = q.eq('collected_by', f.collectorId);
      q = q.range(page * size, page * size + size - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(errorMessage(error));
      return { rows: (data ?? []) as Payment[], count: count ?? 0 };
    },
  });
}

export function useWaivers(monthId?: string, studentId?: string) {
  return useQuery({
    queryKey: ['waivers', monthId, studentId],
    staleTime: 15_000,
    queryFn: () => {
      let q = supabase.from('waivers').select('*').is('revoked_at', null);
      if (monthId) q = q.eq('month_id', monthId);
      if (studentId) q = q.eq('student_id', studentId);
      return rows<Waiver[]>(q);
    },
  });
}

export function useExpenses(monthId?: string) {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['expenses', monthId],
    enabled: role !== 'pending',
    staleTime: 15_000,
    queryFn: () => {
      let q = supabase.from('expenses').select('*').order('spent_on', { ascending: false }).order('created_at', { ascending: false });
      if (monthId) q = q.eq('month_id', monthId);
      return rows<Expense[]>(q);
    },
  });
}

export function useHandovers() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['handovers'],
    enabled: role !== 'pending',
    staleTime: 15_000,
    queryFn: () => rows<Handover[]>(supabase.from('handovers').select('*').order('handed_at', { ascending: false }).limit(500)),
  });
}

export function useOtherIncome(monthId?: string) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['other-income', monthId],
    enabled: can('admin', 'treasurer', 'auditor'),
    queryFn: () => {
      let q = supabase.from('other_income').select('*').order('received_on', { ascending: false });
      if (monthId) q = q.eq('month_id', monthId);
      return rows<OtherIncome[]>(q);
    },
  });
}

export function useNotifications() {
  const { session, role } = useAuth();
  return useQuery({
    queryKey: ['notifications', session?.user.id],
    enabled: !!session && role !== 'pending',
    refetchInterval: 60_000,
    queryFn: () => rows<NotificationRow[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)),
  });
}

export function useAuditLog(page: number, table?: string) {
  const size = 40;
  return useQuery({
    queryKey: ['audit', page, table],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (table) q = q.eq('table_name', table);
      const { data, error, count } = await q.range(page * size, page * size + size - 1);
      if (error) throw new Error(errorMessage(error));
      return { rows: (data ?? []) as AuditLog[], count: count ?? 0, size };
    },
  });
}

// ---------------------------------------------------------------- mutations
const MONEY_KEYS = ['ledger', 'treasury', 'statuses', 'statuses-student', 'payments', 'waivers', 'expenses', 'handovers', 'collector-summaries', 'other-income', 'audit', 'notifications', 'public-dashboard'];

/** Run a write, show a toast, and refresh every money-related query. */
export function useAction<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>, opts: { success?: string; extraKeys?: string[] } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (opts.success) toast.success(opts.success);
      for (const k of [...MONEY_KEYS, ...(opts.extraKeys ?? [])]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
