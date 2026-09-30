import { useCallback, useEffect, useState } from 'react';
import type { Role } from '../data/roles';
import { supabase } from './supabase';

export interface EmployeeAccount {
    employee_id: string;
    role: Role;
    login_enabled: boolean;
}

export async function createEmployeeAccount(payload: {
    employee_id: string;
    email: string;
    name: string;
    password: string;
    role: Role;
}) {
    let data;
    let error;
    try {
        ({ data, error } = await supabase.functions.invoke('create-employee-account', { body: payload }));
    } catch (invokeError) {
        console.error('[Employee accounts] Edge Function invocation threw:', invokeError);
        return { data: null, error: invokeError instanceof Error ? invokeError.message : 'Could not reach create-employee-account' };
    }
    if (!error) return { data: data as EmployeeAccount | null, error: null };

    let message = error.message;
    const response = (error as { context?: Response }).context;
    if (response) {
        try {
            const body = (await response.clone().json()) as { error?: string };
            if (body.error) message = body.error;
            console.error('[Employee accounts] Edge Function returned an error response:', { status: response.status, body });
        } catch {
            console.error('[Employee accounts] Edge Function returned a non-JSON error response:', { status: response.status, message });
        }
    }
    if (!response) console.error('[Employee accounts] Edge Function invocation failed:', error);
    return { data: null, error: message };
}

export async function updateEmployeeAccountRole(employeeId: string, role: Role) {
    const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('employee_id', employeeId)
        .select('employee_id');

    if (error) return { error: error.message };
    if (!data?.length) return { error: 'No login account is linked to this employee.' };
    return { error: null };
}

export function useEmployeeAccounts() {
    const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        const { data, error: fetchError } = await supabase
            .from('profiles')
            .select('employee_id, role, login_enabled')
            .not('employee_id', 'is', null);
        if (fetchError) {
            setError(fetchError.message);
        } else {
            setError(null);
            setAccounts((data ?? []) as EmployeeAccount[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { accounts, error, loading, refresh };
}
