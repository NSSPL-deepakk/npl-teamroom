-- Recruitment is persisted in Supabase; no client-side seed data is required.

CREATE TABLE IF NOT EXISTS public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code text NOT NULL UNIQUE,
  title text NOT NULL,
  department text NOT NULL,
  hiring_manager text NOT NULL,
  positions integer NOT NULL DEFAULT 1 CHECK (positions > 0),
  employment_type text NOT NULL CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Internship')),
  experience text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAUSED', 'CLOSED')),
  created_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  experience text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'APPLIED' CHECK (stage IN ('APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'OFFER_SENT', 'HIRED', 'REJECTED')),
  interview_date timestamptz,
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_openings_status_idx ON public.job_openings (status);
CREATE INDEX IF NOT EXISTS candidates_opening_id_idx ON public.candidates (opening_id);
CREATE INDEX IF NOT EXISTS candidates_stage_idx ON public.candidates (stage);
CREATE INDEX IF NOT EXISTS interviews_candidate_id_idx ON public.interviews (candidate_id);
CREATE INDEX IF NOT EXISTS interviews_status_idx ON public.interviews (status);
CREATE INDEX IF NOT EXISTS offers_candidate_id_idx ON public.offers (candidate_id);
CREATE UNIQUE INDEX IF NOT EXISTS offers_candidate_id_unique_idx ON public.offers (candidate_id);

ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recruitment_job_openings_admin_hr ON public.job_openings;
CREATE POLICY recruitment_job_openings_admin_hr ON public.job_openings
  FOR ALL TO authenticated
  USING (public.current_app_role() IN ('HR', 'SUPER_ADMIN'))
  WITH CHECK (public.current_app_role() IN ('HR', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS recruitment_candidates_admin_hr ON public.candidates;
CREATE POLICY recruitment_candidates_admin_hr ON public.candidates
  FOR ALL TO authenticated
  USING (public.current_app_role() IN ('HR', 'SUPER_ADMIN'))
  WITH CHECK (public.current_app_role() IN ('HR', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS recruitment_interviews_admin_hr ON public.interviews;
CREATE POLICY recruitment_interviews_admin_hr ON public.interviews
  FOR ALL TO authenticated
  USING (public.current_app_role() IN ('HR', 'SUPER_ADMIN'))
  WITH CHECK (public.current_app_role() IN ('HR', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS recruitment_offers_admin_hr ON public.offers;
CREATE POLICY recruitment_offers_admin_hr ON public.offers
  FOR ALL TO authenticated
  USING (public.current_app_role() IN ('HR', 'SUPER_ADMIN'))
  WITH CHECK (public.current_app_role() IN ('HR', 'SUPER_ADMIN'));
