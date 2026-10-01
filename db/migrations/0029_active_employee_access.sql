CREATE OR REPLACE FUNCTION public.is_current_employee_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN p.employee_id IS NULL THEN p.role::text IN ('HR', 'SUPER_ADMIN')
      ELSE e.employment_status = 'ACTIVE'
    END
    FROM public.profiles p
    LEFT JOIN public.employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid()
  ), false);
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.is_current_employee_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_employee_active() TO authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.has_active_auth_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_current_employee_active() AND EXISTS (
    SELECT 1
    FROM public.active_sessions
    WHERE user_id = auth.uid()
      AND auth_session_id = (auth.jwt() ->> 'session_id')::uuid
  );
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.has_active_auth_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_auth_session() TO authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.revoke_inactive_employee_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employment_status IS DISTINCT FROM 'ACTIVE'
    AND OLD.employment_status IS DISTINCT FROM NEW.employment_status THEN
    UPDATE public.active_sessions AS active_session
    SET session_id = gen_random_uuid(),
        auth_session_id = gen_random_uuid(),
        updated_at = now()
    FROM public.profiles AS profile
    WHERE profile.employee_id = NEW.id
      AND active_session.user_id = profile.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['employees', 'active_sessions'] LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.revoke_inactive_employee_sessions() FROM PUBLIC;
--> statement-breakpoint

DROP TRIGGER IF EXISTS employees_revoke_inactive_sessions ON public.employees;
CREATE TRIGGER employees_revoke_inactive_sessions
  AFTER UPDATE OF employment_status ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_inactive_employee_sessions();
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'job_openings', 'candidates', 'interviews', 'offers',
    'onboarding_records', 'onboarding_tasks', 'employee_personal_information',
    'employee_emergency_contacts', 'employee_bank_details',
    'employee_onboarding_documents', 'birthday_reminder_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY active_employee_access_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_active_auth_session()) WITH CHECK (public.has_active_auth_session())',
      table_name
    );
  END LOOP;
END;
$$;