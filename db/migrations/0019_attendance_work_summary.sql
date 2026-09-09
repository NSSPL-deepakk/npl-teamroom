-- Store the required summary for manual attendance entries.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS work_summary text;
