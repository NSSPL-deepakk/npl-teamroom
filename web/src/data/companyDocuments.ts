import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type CompanyDocCategory = 'Policy' | 'Letter Template' | 'Form' | 'Other';
export type CompanyDocVisibility = 'ALL' | 'MANAGER_ONLY' | 'SELECTED_EMPLOYEES';

export interface CompanyDocument {
  id: string;
  name: string;
  category: CompanyDocCategory;
  description?: string;
  storage_path?: string;
  file?: {
    name: string;
    type: string;
    size: number;
  };
  uploaded_at: string;
  uploaded_by?: string | null;
  is_visible_to_all: boolean;
  visibility: CompanyDocVisibility;
  visible_employee_ids: string[];
}

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function toCategory(value: string | null | undefined): CompanyDocCategory {
  switch (value) {
    case 'Letter Template':
      return 'Letter Template';
    case 'Form':
      return 'Form';
    case 'Other':
      return 'Other';
    case 'Policy':
    default:
      return 'Policy';
  }
}

function normalizeDocument(row: any): CompanyDocument {
  const visibility = (row.visibility === 'MANAGER_ONLY' || row.visibility === 'SELECTED_EMPLOYEES'
    ? row.visibility
    : row.is_visible_to_all === false ? 'MANAGER_ONLY' : 'ALL') as CompanyDocVisibility;
  return {
    id: row.id,
    name: row.name,
    category: toCategory(row.category),
    description: row.description ?? undefined,
    storage_path: row.storage_path ?? undefined,
    uploaded_at: row.uploaded_at ? new Date(row.uploaded_at).toISOString().slice(0, 10) : '',
    uploaded_by: row.uploaded_by ?? null,
    is_visible_to_all: row.is_visible_to_all !== false,
    visibility,
    visible_employee_ids: Array.isArray(row.visible_employee_ids) ? row.visible_employee_ids : [],
    file: {
      name: row.name,
      type: row.file_type ?? 'application/octet-stream',
      size: Number(row.file_size_bytes ?? 0),
    },
  };
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? '' : '';
}

function explainSupabaseSetupError(message: string): string {
  if (message.toLowerCase().includes('company_documents') || message.toLowerCase().includes('does not exist')) {
    return 'The company document table is not available in Supabase yet. Run the migration in db/migrations/0011_company_documents.sql and refresh the page.';
  }
  if (message.toLowerCase().includes('storage') && message.toLowerCase().includes('bucket')) {
    return 'The company-documents storage bucket is not available yet. Create the bucket and matching RLS policies from db/migrations/0011_company_documents.sql.';
  }
  return message;
}

function isValidDocumentFile(file: File): boolean {
  if (file.size <= 0) return false;
  const allowedExtensions = ['pdf', 'docx', 'xlsx'];
  const ext = getFileExtension(file.name);
  return allowedExtensions.includes(ext) || ACCEPTED_MIME_TYPES.has(file.type);
}

async function currentEmployeeId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('employee_id').eq('id', user.id).single();
  if (error || !data) return null;
  return data.employee_id ?? null;
}

export function useCompanyDocuments() {
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('company_documents')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (fetchError) {
      setError(explainSupabaseSetupError(fetchError.message));
      setDocuments([]);
    } else {
      setError(null);
      setDocuments((data ?? []).map((row) => normalizeDocument(row)));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addDocument = useCallback(async (payload: { name: string; category: CompanyDocCategory; description?: string; file?: File; visibility: CompanyDocVisibility; visible_employee_ids: string[] }) => {
    if (!payload.file) {
      throw new Error('Please select a PDF, DOCX, or XLSX file first.');
    }
    if (!isValidDocumentFile(payload.file)) {
      throw new Error('Only PDF, DOCX, and XLSX files are allowed.');
    }

    const employeeId = await currentEmployeeId();
    const safeCategory = payload.category.toLowerCase().replace(/\s+/g, '-');
    const timestamp = Date.now();
    const storagePath = `${safeCategory}/${timestamp}-${payload.file.name.replace(/\s+/g, '-')}`;

    const { error: uploadError } = await supabase.storage
      .from('company-documents')
      .upload(storagePath, payload.file, { upsert: false, contentType: payload.file.type || undefined });

    if (uploadError) {
      throw new Error(explainSupabaseSetupError(uploadError.message || 'The upload failed. Please try again.'));
    }

    const { data, error: insertError } = await supabase
      .from('company_documents')
      .insert({
        name: payload.name.trim(),
        category: payload.category,
        description: payload.description?.trim() || null,
        storage_path: storagePath,
        file_type: getFileExtension(payload.file.name),
        file_size_bytes: payload.file.size,
        uploaded_by: employeeId,
        is_visible_to_all: payload.visibility === 'ALL',
        visibility: payload.visibility,
        visible_employee_ids: payload.visible_employee_ids,
      })
      .select('*')
      .single();

    if (insertError) {
      await supabase.storage.from('company-documents').remove([storagePath]);
      throw new Error(explainSupabaseSetupError(insertError.message || 'The document metadata could not be saved.'));
    }

    const created = normalizeDocument(data);
    setDocuments((prev) => [created, ...prev]);
    setError(null);
    return created;
  }, []);

  const removeDocument = useCallback(async (id: string) => {
    const target = documents.find((document) => document.id === id);
    if (!target) return false;

    try {
      if (target.storage_path) {
        const { error: storageError } = await supabase.storage.from('company-documents').remove([target.storage_path]);
        if (storageError) {
          throw new Error(storageError.message || 'The file could not be removed from storage.');
        }
      }

      const { error: deleteError } = await supabase.from('company_documents').delete().eq('id', id);
      if (deleteError) {
        throw new Error(explainSupabaseSetupError(deleteError.message || 'The document record could not be removed.'));
      }

      setDocuments((prev) => prev.filter((document) => document.id !== id));
      setError(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to remove document.';
      setError(message);
      return false;
    }
  }, [documents]);

  const openDocument = useCallback(async (document: CompanyDocument) => {
    if (!document.storage_path) return null;
    const { data, error } = await supabase.storage.from('company-documents').createSignedUrl(document.storage_path, 60);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not generate a secure document link.');
    return data.signedUrl;
  }, []);

  return { documents, loading, error, addDocument, removeDocument, openDocument, refresh };
}
