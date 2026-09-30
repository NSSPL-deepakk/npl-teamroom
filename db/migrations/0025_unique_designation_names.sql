CREATE TEMP TABLE designation_merge_map ON COMMIT DROP AS
WITH employee_counts AS (
  SELECT designation_id, count(*) AS employee_count
  FROM public.employees
  WHERE designation_id IS NOT NULL
  GROUP BY designation_id
), ranked AS (
  SELECT
    d.id,
    first_value(d.id) OVER (
      PARTITION BY lower(regexp_replace(btrim(d.name), '[[:space:]]+', ' ', 'g'))
      ORDER BY coalesce(ec.employee_count, 0) DESC, (d.department_id IS NOT NULL) DESC, d.created_at, d.id
    ) AS canonical_id
  FROM public.designations d
  LEFT JOIN employee_counts ec ON ec.designation_id = d.id
)
SELECT id, canonical_id
FROM ranked;

INSERT INTO public.designation_departments (designation_id, department_id)
SELECT DISTINCT merge_map.canonical_id, designation.department_id
FROM designation_merge_map merge_map
JOIN public.designations designation ON designation.id = merge_map.id
WHERE designation.department_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.designation_departments (designation_id, department_id)
SELECT DISTINCT merge_map.canonical_id, links.department_id
FROM designation_merge_map merge_map
JOIN public.designation_departments links ON links.designation_id = merge_map.id
ON CONFLICT DO NOTHING;

UPDATE public.employees employee
SET designation_id = merge_map.canonical_id
FROM designation_merge_map merge_map
WHERE employee.designation_id = merge_map.id
  AND merge_map.id <> merge_map.canonical_id;

UPDATE public.designations designation
SET name = regexp_replace(btrim(designation.name), '[[:space:]]+', ' ', 'g')
FROM designation_merge_map merge_map
WHERE designation.id = merge_map.canonical_id;

DELETE FROM public.designations designation
USING designation_merge_map merge_map
WHERE designation.id = merge_map.id
  AND merge_map.id <> merge_map.canonical_id;

CREATE UNIQUE INDEX designations_name_normalized_uidx
  ON public.designations (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')));