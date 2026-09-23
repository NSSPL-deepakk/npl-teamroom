import type { Employee } from './employees';
import type { Role } from './roles';
import { useAuth } from '../contexts/AuthContext';

// Demo-only fallback when no authenticated profile is available yet.
const CURRENT_EMPLOYEE_BY_ROLE: Partial<Record<Role, string>> = {
  SUPER_ADMIN: 'e1', // Super Admin user
  HR: 'e12', // Anita Rao — HR Executive
  MANAGER: 'e6', // Vikram Joshi — Engineering Manager
  EMPLOYEE: 'e3', // Arjun Sinha
};

export function useCurrentEmployee(role: Role, employees: Employee[]): Employee | null {
  const { profile } = useAuth();
  const id = profile?.employee_id ?? CURRENT_EMPLOYEE_BY_ROLE[role] ?? null;
  if (!id) return null;
  return employees.find((e) => e.id === id) ?? null;
}
