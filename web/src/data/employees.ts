import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type WorkMode = 'OFFICE' | 'WFH' | 'HYBRID';
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE';
export type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';

export interface Employee {
    id: string;
    employee_code: string;
    name: string;
    email: string;
    phone: string;
    department_id: string;
    designation_id: string;
    manager_id: string | null;
    joining_date: string;
    date_of_birth?: string;
    birthday_message?: string | null;
    anniversary_message?: string | null;
    gender?: Gender;
    employment_status: EmploymentStatus;
    work_mode: WorkMode;
}

const SELECT_COLUMNS =
    'id, employee_code, name, email, phone, department_id, designation_id, manager_id, joining_date, date_of_birth, birthday_message, anniversary_message, gender, employment_status, work_mode';

function nextEmployeeCode(existing: Employee[]): string {
    const nums = existing.map((e) => parseInt(e.employee_code.replace('EMP-', ''), 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 1000) + 1;
    return `EMP-${next}`;
}

export function useEmployees() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const { data, error: fetchError } = await supabase
            .from('employees')
            .select(SELECT_COLUMNS)
            .order('employee_code', { ascending: true });
        if (fetchError) {
            setError(fetchError.message);
        } else {
            setError(null);
            setEmployees((data ?? []) as Employee[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        const channel = supabase
            .channel('employees-data')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const id = String((payload.old as Partial<Employee>).id ?? '');
                    if (id) setEmployees((prev) => prev.filter((employee) => employee.id !== id));
                    return;
                }

                const changedEmployee = payload.new as Employee;
                if (!changedEmployee.id) return;
                setEmployees((prev) => {
                    const exists = prev.some((employee) => employee.id === changedEmployee.id);
                    const next = exists
                        ? prev.map((employee) => employee.id === changedEmployee.id ? changedEmployee : employee)
                        : [...prev, changedEmployee];
                    return next.sort((a, b) => a.employee_code.localeCompare(b.employee_code));
                });
            })
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, []);

    const addEmployee = useCallback(
        async (e: Omit<Employee, 'id' | 'employee_code'>) => {
            const employee_code = nextEmployeeCode(employees);
            const { data, error: insertError } = await supabase
                .from('employees')
                .insert({ ...e, employee_code })
                .select(SELECT_COLUMNS)
                .single();
            if (insertError) {
                setError(insertError.message);
                console.error('[Employees] Could not create employee row:', insertError);
                return null;
            }
            setEmployees((prev) => [...prev, data as Employee]);
            return (data as Employee).id;
        },
        [employees],
    );

    const updateEmployee = useCallback(
        async (id: string, patch: Partial<Omit<Employee, 'id' | 'employee_code'>>) => {
            const { data, error: updateError } = await supabase
                .from('employees')
                .update(patch)
                .eq('id', id)
                .select(SELECT_COLUMNS)
                .single();
            if (updateError) {
                setError(updateError.message);
                console.error('[Employees] Could not update employee:', updateError);
                return updateError.message;
            }
            setEmployees((prev) => prev.map((e) => (e.id === id ? (data as Employee) : e)));
            return null;
        },
        [],
    );

    const toggleStatus = useCallback(
        async (id: string) => {
            const current = employees.find((e) => e.id === id);
            if (!current) return;
            const nextStatus: EmploymentStatus = current.employment_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            await updateEmployee(id, { employment_status: nextStatus });
        },
        [employees, updateEmployee],
    );

    return { employees, loading, error, addEmployee, updateEmployee, toggleStatus, refresh };
}
