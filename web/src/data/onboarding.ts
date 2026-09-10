import { useCallback, useEffect, useState } from 'react';
import type { Candidate } from './recruitment';
import { supabase } from '../lib/supabase';

export type OnboardingStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingCategory = 'Personal Information' | 'Documents';
export type OnboardingDocumentType = 'AADHAAR' | 'PAN' | 'OFFER_LETTER' | 'BANK_DETAILS';
export const CATEGORIES: OnboardingCategory[] = ['Personal Information', 'Documents'];
export const TASK_LABELS: Record<OnboardingCategory, string[]> = {
    'Personal Information': ['Collect personal details', 'Confirm emergency contact'],
    Documents: ['Verify identity documents', 'Collect signed offer letter', 'Collect bank details'],
};

export interface OnboardingTask { id: string; label: string; category: OnboardingCategory; completed: boolean; }
export interface OnboardingDocument { id: string; document_type: OnboardingDocumentType; file_name: string; storage_path: string; mime_type: string; file_size: number; }
export interface PersonalInformation { full_name: string; date_of_birth: string; gender: string; personal_email: string; phone: string; alternate_phone: string; address: string; city: string; state: string; postal_code: string; country: string; }
export interface EmergencyContact { contact_name: string; relationship: string; phone: string; alternate_phone: string; address: string; }
export interface BankDetails { account_holder_name: string; bank_name: string; account_number: string; ifsc_code: string; branch: string; }
export interface OnboardingRecord { id: string; candidate_id: string; joining_date: string; tasks: OnboardingTask[]; employee_id: string | null; started: boolean; status: OnboardingStatus; progress: number; candidate: Candidate; personal: PersonalInformation | null; emergency: EmergencyContact | null; bank: BankDetails | null; documents: OnboardingDocument[]; }

type FormTarget = { candidate_id: string; employee_id: string | null };
const EMPTY_PERSONAL: PersonalInformation = { full_name: '', date_of_birth: '', gender: '', personal_email: '', phone: '', alternate_phone: '', address: '', city: '', state: '', postal_code: '', country: '' };
const EMPTY_EMERGENCY: EmergencyContact = { contact_name: '', relationship: '', phone: '', alternate_phone: '', address: '' };
const EMPTY_BANK: BankDetails = { account_holder_name: '', bank_name: '', account_number: '', ifsc_code: '', branch: '' };

function target(record: OnboardingRecord): FormTarget { return { candidate_id: record.candidate_id, employee_id: record.employee_id }; }
function taskRows(recordId: string, employeeId: string | null) { return CATEGORIES.flatMap((category) => TASK_LABELS[category].map((task_name) => ({ onboarding_id: recordId, employee_id: employeeId, category, task_name }))); }
function normalizeRecord(row: any, candidates: Candidate[], tasks: any[], documents: any[], personal: any, emergency: any, bank: any): OnboardingRecord | null {
    const candidate = candidates.find((item) => item.id === row.candidate_id);
    if (!candidate) return null;
    const recordTasks = tasks.filter((task) => task.onboarding_id === row.id).map((task) => ({ id: task.id, label: task.task_name, category: task.category as OnboardingCategory, completed: Boolean(task.completed) }));
    const completed = recordTasks.filter((task) => task.completed).length;
    const progress = Math.round((completed / 5) * 100);
    return { ...row, tasks: recordTasks, status: !row.started ? 'PENDING' : progress === 100 ? 'COMPLETED' : 'IN_PROGRESS', progress, candidate, personal: personal.find((item: any) => item.candidate_id === row.candidate_id || item.employee_id === row.employee_id) ?? null, emergency: emergency.find((item: any) => item.candidate_id === row.candidate_id || item.employee_id === row.employee_id) ?? null, bank: bank.find((item: any) => item.candidate_id === row.candidate_id || item.employee_id === row.employee_id) ?? null, documents: documents.filter((item: any) => item.candidate_id === row.candidate_id || item.employee_id === row.employee_id).map((item: any) => ({ ...item, file_size: Number(item.file_size ?? 0) })) };
}

export function useOnboarding(candidates: Candidate[]) {
    const [records, setRecords] = useState<OnboardingRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [recordsResult, tasksResult, docsResult, personalResult, emergencyResult, bankResult] = await Promise.all([
            supabase.from('onboarding_records').select('*').order('joining_date', { ascending: true }),
            supabase.from('onboarding_tasks').select('*'),
            supabase.from('employee_onboarding_documents').select('*').order('uploaded_at', { ascending: false }),
            supabase.from('employee_personal_information').select('*'),
            supabase.from('employee_emergency_contacts').select('*'),
            supabase.from('employee_bank_details').select('*'),
        ]);
        const firstError = recordsResult.error ?? tasksResult.error ?? docsResult.error ?? personalResult.error ?? emergencyResult.error ?? bankResult.error;
        if (firstError) { setError(`Unable to load onboarding information: ${firstError.message}`); setRecords([]); }
        else { setError(null); setRecords((recordsResult.data ?? []).map((row) => normalizeRecord(row, candidates, tasksResult.data ?? [], docsResult.data ?? [], personalResult.data ?? [], emergencyResult.data ?? [], bankResult.data ?? [])).filter(Boolean) as OnboardingRecord[]); }
        setLoading(false);
    }, [candidates]);
    useEffect(() => { void refresh(); }, [refresh]);

    const startOnboarding = useCallback(async (candidate: Candidate, joiningDate: string) => {
        setActionLoading(true);
        const { data, error: insertError } = await supabase.from('onboarding_records').upsert({ candidate_id: candidate.id, joining_date: joiningDate, started: true }, { onConflict: 'candidate_id' }).select('*').single();
        if (insertError || !data) { setError(`Unable to start onboarding: ${insertError?.message ?? 'Unknown error'}`); setActionLoading(false); return false; }
        const { error: taskError } = await supabase.from('onboarding_tasks').upsert(taskRows(data.id, data.employee_id), { onConflict: 'onboarding_id,task_name', ignoreDuplicates: true });
        if (taskError) { setError(`Unable to create onboarding checklist: ${taskError.message}`); setActionLoading(false); return false; }
        await refresh(); setActionLoading(false); return true;
    }, [refresh]);

    const toggleTask = useCallback(async (recordId: string, taskId: string, completed: boolean) => {
        setActionLoading(true);
        const { error: updateError } = await supabase.from('onboarding_tasks').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', taskId).eq('onboarding_id', recordId);
        if (updateError) setError(`Unable to update checklist: ${updateError.message}`); else await refresh();
        setActionLoading(false);
    }, [refresh]);

    const activateEmployee = useCallback(async (recordId: string, employeeId: string) => {
        setActionLoading(true);
        const { error: updateError } = await supabase.from('onboarding_records').update({ employee_id: employeeId }).eq('id', recordId);
        if (updateError) { setError(`Unable to link employee: ${updateError.message}`); setActionLoading(false); return false; }
        await supabase.from('onboarding_tasks').update({ employee_id: employeeId }).eq('onboarding_id', recordId);
        await refresh(); setActionLoading(false); return true;
    }, [refresh]);

    const saveForm = useCallback(async (table: string, values: Record<string, unknown>, record: OnboardingRecord, taskLabel: string) => {
        setActionLoading(true);
        const { error: saveError } = await supabase.from(table).upsert({ ...values, ...target(record) }, { onConflict: record.employee_id ? 'employee_id' : 'candidate_id' });
        if (saveError) { setError(`Unable to save ${taskLabel.toLowerCase()}: ${saveError.message}`); setActionLoading(false); return false; }
        const task = record.tasks.find((item) => item.label === taskLabel);
        if (task) await supabase.from('onboarding_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', task.id);
        await refresh(); setActionLoading(false); return true;
    }, [refresh]);

    const savePersonal = useCallback((record: OnboardingRecord, values: PersonalInformation) => saveForm('employee_personal_information', values as unknown as Record<string, unknown>, record, 'Collect personal details'), [saveForm]);
    const saveEmergency = useCallback((record: OnboardingRecord, values: EmergencyContact) => saveForm('employee_emergency_contacts', values as unknown as Record<string, unknown>, record, 'Confirm emergency contact'), [saveForm]);
    const saveBank = useCallback((record: OnboardingRecord, values: BankDetails) => saveForm('employee_bank_details', values as unknown as Record<string, unknown>, record, 'Collect bank details'), [saveForm]);

    const uploadDocument = useCallback(async (record: OnboardingRecord, type: OnboardingDocumentType, file: File) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        const maxSize = 10 * 1024 * 1024;
        if (!file.size || file.size > maxSize || !allowed.includes(file.type)) { setError('Unable to upload document. Please use a PDF, JPG, JPEG, or PNG file up to 10 MB.'); return false; }
        setActionLoading(true);
        const path = `${record.employee_id ?? record.candidate_id}/${type.toLowerCase()}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const upload = await supabase.storage.from('employee-onboarding-documents').upload(path, file, { upsert: false, contentType: file.type });
        if (upload.error) { setError(`Unable to upload document: ${upload.error.message}`); setActionLoading(false); return false; }
        const metadata = await supabase.from('employee_onboarding_documents').insert({ ...target(record), document_type: type, file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size }).select('*').single();
        if (metadata.error) { await supabase.storage.from('employee-onboarding-documents').remove([path]); setError(`Unable to save document metadata: ${metadata.error.message}`); setActionLoading(false); return false; }
        const documentTypes = record.documents.map((item) => item.document_type).concat(type);
        if (documentTypes.includes('AADHAAR') && documentTypes.includes('PAN')) { const task = record.tasks.find((item) => item.label === 'Verify identity documents'); if (task) await supabase.from('onboarding_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', task.id); }
        if (type === 'OFFER_LETTER' || type === 'BANK_DETAILS') { const label = type === 'OFFER_LETTER' ? 'Collect signed offer letter' : 'Collect bank details'; const task = record.tasks.find((item) => item.label === label); if (task) await supabase.from('onboarding_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', task.id); }
        await refresh(); setActionLoading(false); return true;
    }, [refresh]);

    const viewDocument = useCallback(async (document: OnboardingDocument) => {
        const { data, error: urlError } = await supabase.storage.from('employee-onboarding-documents').createSignedUrl(document.storage_path, 60);
        if (urlError || !data?.signedUrl) { setError(`Unable to view document: ${urlError?.message ?? 'No secure URL generated.'}`); return null; }
        return data.signedUrl;
    }, []);

    return { records, startOnboarding, toggleTask, activateEmployee, savePersonal, saveEmergency, saveBank, uploadDocument, viewDocument, refresh, loading, actionLoading, error, EMPTY_PERSONAL, EMPTY_EMERGENCY, EMPTY_BANK };
}
