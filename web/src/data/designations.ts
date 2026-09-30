import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Designation {
    id: string;
    name: string;
    department_id: string;
    department_ids: string[];
}

export function normalizeDesignationName(name: string) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function useDesignations(departmentId?: string) {
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from('designations')
            .select('id, name, department_id')
            .order('name', { ascending: true });
        if (departmentId) query = query.eq('department_id', departmentId);
        const [{ data, error: fetchError }, { data: links, error: linksError }] = await Promise.all([
            query,
            supabase.from('designation_departments').select('designation_id, department_id'),
        ]);
        if (fetchError || linksError) {
            setError(fetchError?.message ?? linksError?.message ?? 'Could not load designations');
        } else {
            setError(null);
            const departmentIdsByDesignation = new Map<string, string[]>();
            for (const link of links ?? []) {
                const ids = departmentIdsByDesignation.get(link.designation_id) ?? [];
                ids.push(link.department_id);
                departmentIdsByDesignation.set(link.designation_id, ids);
            }
            setDesignations((data ?? []).map((designation) => ({
                ...designation,
                department_ids: departmentIdsByDesignation.get(designation.id) ?? [designation.department_id],
            })) as Designation[]);
        }
        setLoading(false);
    }, [departmentId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const addDesignation = useCallback(async (name: string, department_ids: string[]) => {
        const normalizedName = normalizeDesignationName(name);
        const selectedDepartmentIds = [...new Set(department_ids)];
        if (!normalizedName || selectedDepartmentIds.length === 0) return null;

        const existing = designations.find((designation) => normalizeDesignationName(designation.name) === normalizedName);
        if (existing) {
            const missingDepartmentIds = selectedDepartmentIds.filter((id) => !existing.department_ids.includes(id));
            if (missingDepartmentIds.length > 0) {
                const { error: linksError } = await supabase.from('designation_departments').insert(
                    missingDepartmentIds.map((id) => ({ designation_id: existing.id, department_id: id })),
                );
                if (linksError) {
                    setError(linksError.message);
                    return null;
                }
            }
            const updatedDepartmentIds = [...new Set([...existing.department_ids, ...missingDepartmentIds])];
            setDesignations((prev) => prev.map((designation) => (
                designation.id === existing.id ? { ...designation, department_ids: updatedDepartmentIds } : designation
            )));
            setError(null);
            return existing.id;
        }

        const cleanName = name.trim().replace(/\s+/g, ' ');
        const department_id = selectedDepartmentIds[0];
        const { data, error: insertError } = await supabase
            .from('designations')
            .insert({ name: cleanName, department_id })
            .select('id, name, department_id')
            .single();
        if (insertError) {
            if (insertError.code === '23505') {
                const [{ data: existingRows, error: lookupError }, { data: existingLinks, error: linksLookupError }] = await Promise.all([
                    supabase.from('designations').select('id, name, department_id'),
                    supabase.from('designation_departments').select('designation_id, department_id'),
                ]);
                const matchingRow = existingRows?.find((designation) => normalizeDesignationName(designation.name) === normalizedName);
                if (!lookupError && !linksLookupError && matchingRow) {
                    const linkedDepartmentIds = (existingLinks ?? [])
                        .filter((link) => link.designation_id === matchingRow.id)
                        .map((link) => link.department_id);
                    const missingDepartmentIds = selectedDepartmentIds.filter((id) => !linkedDepartmentIds.includes(id));
                    if (missingDepartmentIds.length > 0) {
                        const { error: linkError } = await supabase.from('designation_departments').insert(
                            missingDepartmentIds.map((id) => ({ designation_id: matchingRow.id, department_id: id })),
                        );
                        if (linkError) {
                            setError(linkError.message);
                            return null;
                        }
                    }
                    const departmentIds = [...new Set([...linkedDepartmentIds, ...missingDepartmentIds])];
                    setDesignations((prev) => {
                        const next = { ...matchingRow, department_ids: departmentIds } as Designation;
                        return prev.some((designation) => designation.id === matchingRow.id)
                            ? prev.map((designation) => designation.id === matchingRow.id ? next : designation)
                            : [...prev, next].sort((a, b) => a.name.localeCompare(b.name));
                    });
                    setError(null);
                    return matchingRow.id;
                }
                setError(lookupError?.message ?? linksLookupError?.message ?? insertError.message);
                return null;
            }
            setError(insertError.message);
            return null;
        }
        const { error: linksError } = await supabase.from('designation_departments').insert(
            selectedDepartmentIds.map((id) => ({ designation_id: data.id, department_id: id })),
        );
        if (linksError) {
            await supabase.from('designations').delete().eq('id', data.id);
            setError(linksError.message);
            return null;
        }
        setDesignations((prev) => [...prev, { ...(data as Omit<Designation, 'department_ids'>), department_ids: selectedDepartmentIds }].sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
        return (data as Designation).id;
    }, [designations]);

    const updateDesignation = useCallback(async (id: string, name: string, department_ids: string[]) => {
        const normalizedName = normalizeDesignationName(name);
        const selectedDepartmentIds = [...new Set(department_ids)];
        if (!normalizedName || selectedDepartmentIds.length === 0) return null;

        const duplicate = designations.find((designation) => (
            designation.id !== id && normalizeDesignationName(designation.name) === normalizedName
        ));
        if (duplicate) {
            setError('A designation with this title already exists. Edit that designation to add departments.');
            return null;
        }

        const existing = designations.find((designation) => designation.id === id);
        if (!existing) {
            setError('This designation is no longer available. Refresh and try again.');
            return null;
        }

        const missingDepartmentIds = selectedDepartmentIds.filter((departmentId) => !existing.department_ids.includes(departmentId));
        if (missingDepartmentIds.length > 0) {
            const { error: insertLinksError } = await supabase.from('designation_departments').insert(
                missingDepartmentIds.map((departmentId) => ({ designation_id: id, department_id: departmentId })),
            );
            if (insertLinksError) {
                setError(insertLinksError.message);
                return null;
            }
        }

        const cleanName = name.trim().replace(/\s+/g, ' ');
        const { data, error: updateError } = await supabase
            .from('designations')
            .update({ name: cleanName, department_id: selectedDepartmentIds[0] })
            .eq('id', id)
            .select('id, name, department_id')
            .single();
        if (updateError) {
            setError(updateError.code === '23505' ? 'A designation with this title already exists.' : updateError.message);
            await refresh();
            return null;
        }

        const removedDepartmentIds = existing.department_ids.filter((departmentId) => !selectedDepartmentIds.includes(departmentId));
        if (removedDepartmentIds.length > 0) {
            const { error: removeLinksError } = await supabase
                .from('designation_departments')
                .delete()
                .eq('designation_id', id)
                .in('department_id', removedDepartmentIds);
            if (removeLinksError) {
                setError(removeLinksError.message);
                await refresh();
                return null;
            }
        }

        setDesignations((prev) => prev
            .map((designation) => designation.id === id
                ? { ...(data as Omit<Designation, 'department_ids'>), department_ids: selectedDepartmentIds }
                : designation)
            .sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
        return id;
    }, [designations, refresh]);

    const removeDesignation = useCallback(async (id: string) => {
        const { error: deleteError } = await supabase.from('designations').delete().eq('id', id);
        if (deleteError) {
            setError(deleteError.message);
            return;
        }
        setDesignations((prev) => prev.filter((d) => d.id !== id));
    }, []);

    return { designations, loading, error, addDesignation, updateDesignation, removeDesignation, refresh };
}
