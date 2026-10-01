import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Department {
    id: string;
    name: string;
}

export function useDepartments() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const { data, error: fetchError } = await supabase
            .from('departments')
            .select('id, name')
            .order('name', { ascending: true });
        if (fetchError) {
            setError(fetchError.message);
        } else {
            setError(null);
            setDepartments(data ?? []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const addDepartment = useCallback(
        async (name: string) => {
            const { data, error: insertError } = await supabase
                .from('departments')
                .insert({ name })
                .select('id, name')
                .single();
            if (insertError) {
                setError(insertError.message);
                return null;
            }
            setDepartments((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            return data.id;
        },
        [],
    );

    const removeDepartment = useCallback(async (id: string) => {
        const { error: deleteError } = await supabase.from('departments').delete().eq('id', id);
        if (deleteError) {
            setError(deleteError.message);
            return;
        }
        setDepartments((prev) => prev.filter((d) => d.id !== id));
    }, []);

    const updateDepartment = useCallback(async (id: string, name: string) => {
        const { data, error: updateError } = await supabase
            .from('departments')
            .update({ name })
            .eq('id', id)
            .select('id, name')
            .single();
        if (updateError) {
            setError(updateError.message);
            return false;
        }
        setError(null);
        setDepartments((prev) => prev.map((department) => department.id === id ? data : department).sort((a, b) => a.name.localeCompare(b.name)));
        return true;
    }, []);

    return { departments, loading, error, addDepartment, updateDepartment, removeDepartment, refresh };
}
