-- Employee onboarding workflow data and private document storage.

CREATE TABLE IF NOT EXISTS public.onboarding_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  joining_date date NOT NULL,
  started boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboarding_records(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Personal Information', 'Documents')),
  task_name text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, task_name)
);

CREATE TABLE IF NOT EXISTS public.employee_personal_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  date_of_birth date,
  gender text,
  personal_email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  alternate_phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR candidate_id IS NOT NULL),
  UNIQUE (employee_id),
  UNIQUE (candidate_id)
);

CREATE TABLE IF NOT EXISTS public.employee_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,
  alternate_phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR candidate_id IS NOT NULL),
  UNIQUE (employee_id),
  UNIQUE (candidate_id)
);

CREATE TABLE IF NOT EXISTS public.employee_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  ifsc_code text NOT NULL,
  branch text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR candidate_id IS NOT NULL),
  UNIQUE (employee_id),
  UNIQUE (candidate_id)
);

CREATE TABLE IF NOT EXISTS public.employee_onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('AADHAAR', 'PAN', 'OFFER_LETTER', 'BANK_DETAILS')),
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR candidate_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS onboarding_records_employee_idx ON public.onboarding_records (employee_id);
CREATE INDEX IF NOT EXISTS onboarding_tasks_record_idx ON public.onboarding_tasks (onboarding_id);
CREATE INDEX IF NOT EXISTS onboarding_documents_employee_idx ON public.employee_onboarding_documents (employee_id);
CREATE INDEX IF NOT EXISTS onboarding_documents_candidate_idx ON public.employee_onboarding_documents (candidate_id);

ALTER TABLE public.onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_personal_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_onboarding_documents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['onboarding_records', 'onboarding_tasks', 'employee_personal_information', 'employee_emergency_contacts', 'employee_bank_details', 'employee_onboarding_documents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_hr_admin', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.current_app_role() IN (''HR'', ''SUPER_ADMIN'')) WITH CHECK (public.current_app_role() IN (''HR'', ''SUPER_ADMIN''))', table_name || '_hr_admin', table_name);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-onboarding-documents', 'employee-onboarding-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS onboarding_documents_storage_select ON storage.objects;
CREATE POLICY onboarding_documents_storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'employee-onboarding-documents' AND public.current_app_role() IN ('HR', 'SUPER_ADMIN'));
DROP POLICY IF EXISTS onboarding_documents_storage_insert ON storage.objects;
CREATE POLICY onboarding_documents_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'employee-onboarding-documents' AND public.current_app_role() IN ('HR', 'SUPER_ADMIN'));
DROP POLICY IF EXISTS onboarding_documents_storage_update ON storage.objects;
CREATE POLICY onboarding_documents_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-onboarding-documents' AND public.current_app_role() IN ('HR', 'SUPER_ADMIN'))
WITH CHECK (bucket_id = 'employee-onboarding-documents' AND public.current_app_role() IN ('HR', 'SUPER_ADMIN'));
