-- Remove announcement notifications when their holiday/event is deleted.
CREATE OR REPLACE FUNCTION public.remove_announcement_notifications_on_holiday_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE kind = 'announcement_created'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS holidays_remove_announcement_notifications ON public.holidays;
CREATE TRIGGER holidays_remove_announcement_notifications
  AFTER DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.remove_announcement_notifications_on_holiday_delete();

REVOKE EXECUTE ON FUNCTION public.remove_announcement_notifications_on_holiday_delete() FROM PUBLIC;
