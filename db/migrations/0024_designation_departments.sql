CREATE TABLE public.designation_departments (
  designation_id uuid NOT NULL REFERENCES public.designations(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  PRIMARY KEY (designation_id, department_id)
);

INSERT INTO public.designation_departments (designation_id, department_id)
SELECT id, department_id
FROM public.designations
WHERE department_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.designation_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY designation_departments_select_authenticated
  ON public.designation_departments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY designation_departments_write_admin_hr
  ON public.designation_departments FOR ALL TO authenticated
  USING (public.current_app_role() IN ('SUPER_ADMIN', 'HR'))
  WITH CHECK (public.current_app_role() IN ('SUPER_ADMIN', 'HR'));

CREATE POLICY designation_departments_active_auth_session_required
  ON public.designation_departments AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_active_auth_session())
  WITH CHECK (public.has_active_auth_session());