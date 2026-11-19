import { useMemo } from 'react';
import { useAssignments, useCategories, useMonths, useProfiles, useStudents } from '@/lib/queries';
import type { ExpenseCategory, FundMonth, Profile, Student } from '@/lib/types';

/** Id → record maps used across screens, plus each student's current collector. */
export function useLookups() {
  const students = useStudents();
  const profiles = useProfiles();
  const months = useMonths();
  const assignments = useAssignments();
  const categories = useCategories();

  return useMemo(() => {
    const studentById = new Map<string, Student>((students.data ?? []).map((s) => [s.id, s]));
    const profileById = new Map<string, Profile>((profiles.data ?? []).map((p) => [p.id, p]));
    const monthById = new Map<string, FundMonth>((months.data ?? []).map((m) => [m.id, m]));
    const categoryById = new Map<string, ExpenseCategory>((categories.data ?? []).map((c) => [c.id, c]));
    const collectorOf = new Map<string, string>((assignments.data ?? []).map((a) => [a.student_id, a.collector_id]));
    const openMonths = (months.data ?? []).filter((m) => m.status === 'open');
    return {
      students: students.data ?? [],
      profiles: profiles.data ?? [],
      months: months.data ?? [],
      categories: categories.data ?? [],
      openMonths,
      latestOpenMonth: openMonths[0],
      studentById,
      profileById,
      monthById,
      categoryById,
      collectorOf,
      personName: (id: string | null | undefined) => (id ? profileById.get(id)?.full_name || profileById.get(id)?.email || '—' : '—'),
      loading: students.isLoading || profiles.isLoading || months.isLoading,
    };
  }, [students.data, profiles.data, months.data, assignments.data, categories.data, students.isLoading, profiles.isLoading, months.isLoading]);
}
