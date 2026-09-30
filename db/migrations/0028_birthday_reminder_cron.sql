CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.birthday_reminder_log (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  birthday_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('PROCESSING', 'SENT', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 1,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  PRIMARY KEY (employee_id, birthday_date)
);

ALTER TABLE public.birthday_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.birthday_reminder_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.birthday_reminder_log TO service_role;

CREATE OR REPLACE FUNCTION public.claim_birthday_reminder(p_employee_id uuid, p_birthday_date date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_claimed boolean := false;
BEGIN
  INSERT INTO public.birthday_reminder_log (employee_id, birthday_date, status)
  VALUES (p_employee_id, p_birthday_date, 'PROCESSING')
  ON CONFLICT (employee_id, birthday_date) DO NOTHING
  RETURNING true INTO was_claimed;

  RETURN COALESCE(was_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_birthday_reminder(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_birthday_reminder(uuid, date) TO service_role;

SELECT cron.schedule(
  'birthday-reminder-daily-9am-ist',
  '30 3 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://umatdsjexnbcyetghtki.supabase.co/functions/v1/birthday-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-birthday-reminder-token', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'birthday_reminder_cron_token'
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);