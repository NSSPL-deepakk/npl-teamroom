-- Keep one browser session active per user and reject replaced auth sessions at RLS.

CREATE TABLE public.active_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  device_label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY active_sessions_select_own
ON public.active_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
--> statement-breakpoint

CREATE POLICY active_sessions_insert_own
ON public.active_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND auth_session_id = (auth.jwt() ->> 'session_id')::uuid
);
--> statement-breakpoint

CREATE POLICY active_sessions_update_own
ON public.active_sessions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND auth_session_id = (auth.jwt() ->> 'session_id')::uuid
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.has_active_auth_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.active_sessions
    WHERE user_id = auth.uid()
      AND auth_session_id = (auth.jwt() ->> 'session_id')::uuid
  );
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.has_active_auth_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_auth_session() TO authenticated;
--> statement-breakpoint

-- Existing table policies are permissive (OR). This restrictive policy makes
-- every protected table require the current Supabase auth session as well.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'departments', 'designations', 'employees', 'profiles', 'holidays',
    'leave_requests', 'clients', 'projects', 'project_members', 'tasks',
    'task_time_logs', 'task_comments', 'company_documents', 'attendance',
    'attendance_audit'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY active_auth_session_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_active_auth_session()) WITH CHECK (public.has_active_auth_session())',
      table_name
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE POLICY active_auth_session_required
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_active_auth_session())
WITH CHECK (public.has_active_auth_session());
--> statement-breakpoint