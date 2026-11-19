import {
  LayoutDashboard, CalendarRange, ReceiptText, Wallet, ArrowLeftRight, Users, UserCog, Cake, FileBarChart,
  ShieldCheck, Settings, History, type LucideIcon,
} from 'lucide-react';
import type { StringKey } from '@/i18n/strings';
import type { Role } from '@/lib/types';

export interface NavItem {
  to: string;
  label: StringKey;
  icon: LucideIcon;
  roles: Role[];
  mobile?: boolean;
}

const STAFF: Role[] = ['admin', 'treasurer', 'collector', 'auditor'];

export const NAV: NavItem[] = [
  { to: '/app', label: 'navDashboard', icon: LayoutDashboard, roles: STAFF, mobile: true },
  { to: '/app/months', label: 'navMonths', icon: CalendarRange, roles: STAFF, mobile: true },
  { to: '/app/payments', label: 'navPayments', icon: ReceiptText, roles: STAFF, mobile: true },
  { to: '/app/expenses', label: 'navExpenses', icon: Wallet, roles: STAFF, mobile: true },
  { to: '/app/handovers', label: 'navHandovers', icon: ArrowLeftRight, roles: STAFF },
  { to: '/app/students', label: 'navStudents', icon: Users, roles: STAFF },
  { to: '/app/collectors', label: 'navCollectors', icon: UserCog, roles: ['admin', 'treasurer', 'auditor'] },
  { to: '/app/birthdays', label: 'navBirthdays', icon: Cake, roles: STAFF },
  { to: '/app/reports', label: 'navReports', icon: FileBarChart, roles: ['admin', 'treasurer', 'auditor'] },
  { to: '/app/users', label: 'navUsers', icon: ShieldCheck, roles: ['admin'] },
  { to: '/app/audit', label: 'navAudit', icon: History, roles: ['admin', 'treasurer', 'auditor'] },
  { to: '/app/settings', label: 'navSettings', icon: Settings, roles: ['admin'] },
];
