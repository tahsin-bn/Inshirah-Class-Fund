export type Role = 'admin' | 'treasurer' | 'collector' | 'auditor' | 'pending';
export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'rocket' | 'bank' | 'other';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'void';
export type HandoverStatus = 'pending' | 'confirmed' | 'rejected';
export type DueStatus = 'paid' | 'partial' | 'unpaid' | 'waived';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'bkash', 'nagad', 'rocket', 'bank', 'other'];
export const STAFF_ROLES: Role[] = ['admin', 'treasurer', 'collector', 'auditor'];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Settings {
  app_name: string;
  class_name: string;
  currency_symbol: string;
  opening_balance: number;
  opening_balance_note: string | null;
  other_income_enabled: boolean;
  public_dashboard_enabled: boolean;
  public_show_expense_items: boolean;
  public_birthdays_enabled: boolean;
  max_collectors: number;
  updated_at: string;
}

export interface Student {
  id: string;
  roll: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthdate: string | null;
  class_name: string | null;
  group_name: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  joined_on: string;
  archived_at: string | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  student_id: string;
  collector_id: string;
  assigned_at: string;
  unassigned_at: string | null;
}

export interface FundMonth {
  id: string;
  year: number;
  month: number;
  title_en: string;
  title_bn: string;
  contribution_amount: number;
  special_amount: number;
  special_label: string | null;
  deadline: string | null;
  status: 'open' | 'closed';
  notes: string | null;
  closed_at: string | null;
}

export interface LedgerRow {
  month_id: string;
  year: number;
  month: number;
  title_en: string;
  title_bn: string;
  status: 'open' | 'closed';
  contribution_amount: number;
  special_amount: number;
  special_label: string | null;
  deadline: string | null;
  students_due: number;
  expected: number;
  collected: number;
  waived: number;
  outstanding: number;
  other_income: number;
  expenses: number;
  pending_expenses: number;
  opening_balance: number;
  closing_balance: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
  waived_count: number;
  cash_collected: number;
  digital_collected: number;
}

export interface Payment {
  id: string;
  receipt_no: string;
  student_id: string;
  month_id: string;
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  collected_by: string;
  transaction_ref: string | null;
  note: string | null;
  reversal_of: string | null;
  reversal_reason: string | null;
  created_at: string;
}

export interface StudentMonthStatus {
  student_id: string;
  month_id: string;
  expected: number;
  paid: number;
  waived: number;
  remaining: number;
  status: DueStatus;
}

export interface Waiver {
  id: string;
  student_id: string;
  month_id: string;
  amount: number;
  reason: string;
  approved_by: string;
  created_at: string;
  revoked_at: string | null;
}

export interface ExpenseCategory {
  id: string;
  name_en: string;
  name_bn: string;
  is_active: boolean;
  sort_order: number;
}

export interface Expense {
  id: string;
  expense_no: string;
  title: string;
  category_id: string;
  month_id: string;
  amount: number;
  spent_on: string;
  description: string | null;
  payment_method: PaymentMethod;
  receipt_path: string | null;
  status: ExpenseStatus;
  submitted_by: string;
  decided_by: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface Handover {
  id: string;
  handover_no: string;
  collector_id: string;
  amount: number;
  method: PaymentMethod;
  handed_at: string;
  reference: string | null;
  note: string | null;
  status: HandoverStatus;
  received_by: string | null;
  decided_at: string | null;
  reject_reason: string | null;
}

export interface OtherIncome {
  id: string;
  month_id: string;
  source: string;
  amount: number;
  received_on: string;
  method: PaymentMethod;
  note: string | null;
  recorded_by: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface CollectorSummary {
  collector_id: string;
  full_name: string;
  assigned_students: number;
  cash_collected: number;
  handed_confirmed: number;
  handed_pending: number;
  cash_in_hand: number;
}

export interface TreasuryPosition {
  opening_balance: number;
  total_income: number;
  collected: number;
  other_income: number;
  approved_expenses: number;
  pending_expenses: number;
  pending_handovers: number;
  balance: number;
  digital_balance: number;
  cash_balance: number;
  cash_with_collectors: number;
  cash_with_treasury: number;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title_en: string;
  title_bn: string;
  body_en: string | null;
  body_bn: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface PublicDashboard {
  enabled: boolean;
  app_name: string;
  class_name: string;
  generated_at?: string;
  active_students?: number;
  months?: Array<{
    id: string; year: number; month: number; title_en: string; title_bn: string; status: 'open' | 'closed';
    contribution: number; special_label: string | null; expected: number; collected: number; other_income: number;
    expenses: number; opening_balance: number; closing_balance: number;
    paid_count: number; partial_count: number; unpaid_count: number; waived_count: number; students_due: number;
  }>;
  totals?: { opening_balance: number; collected: number; other_income: number; expenses: number; balance: number };
  categories?: Array<{ month_id: string; name_en: string; name_bn: string; amount: number }>;
  expenses?: Array<{ id: string; month_id: string; title: string; amount: number; spent_on: string; category_en: string; category_bn: string }> | null;
  birthdays_today?: string[] | null;
  birthdays_month?: Array<{ name: string; day: number }> | null;
  today?: string;
  recent_collections?: Array<{ day: string; amount: number; last_at: string }>;
}
