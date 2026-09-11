-- Persist recipient-specific notifications for the dashboard bell.
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('announcement_created', 'leave_request_submitted')),
  title text NOT NULL,
  message text NOT NULL,
  reference_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_created_idx
  ON public.notifications (recipient_user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE POLICY notifications_active_auth_session_required
  ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_active_auth_session())
  WITH CHECK (public.has_active_auth_session());

CREATE OR REPLACE FUNCTION public.create_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category = 'Announcement' THEN
    INSERT INTO public.notifications (recipient_user_id, kind, title, message, reference_id)
    SELECT p.id,
           'announcement_created',
           NEW.name,
           COALESCE(NULLIF(NEW.description, ''), 'A new company announcement is available.') || ' · ' || NEW.date::text,
           NEW.id
    FROM public.profiles p
    LEFT JOIN public.employees e ON e.id = p.employee_id
    WHERE p.login_enabled = true
      AND (p.role IN ('HR', 'SUPER_ADMIN') OR e.employment_status = 'ACTIVE');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER holidays_announcement_notifications
  AFTER INSERT ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.create_announcement_notifications();

CREATE OR REPLACE FUNCTION public.create_leave_request_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_user_id, kind, title, message, reference_id)
  SELECT DISTINCT p.id,
         'leave_request_submitted',
         'New leave request',
         e.name || ' submitted a ' || NEW.type::text || ' leave request from ' || NEW.start_date::text || ' to ' || NEW.end_date::text || '.',
         NEW.id
  FROM public.profiles p
  LEFT JOIN public.employees manager ON manager.id = p.employee_id
  JOIN public.employees e ON e.id = NEW.employee_id
  WHERE p.login_enabled = true
    AND (
      p.role IN ('HR', 'SUPER_ADMIN')
      OR (p.role = 'MANAGER' AND manager.id = e.manager_id)
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER leave_request_notifications
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.create_leave_request_notifications();

REVOKE EXECUTE ON FUNCTION public.create_announcement_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_leave_request_notifications() FROM PUBLIC;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
