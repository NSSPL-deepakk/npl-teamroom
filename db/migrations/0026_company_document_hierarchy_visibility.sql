ALTER TABLE public.company_documents
  DROP CONSTRAINT IF EXISTS company_documents_visibility_check;

ALTER TABLE public.company_documents
  ADD CONSTRAINT company_documents_visibility_check
  CHECK (visibility IN ('ALL', 'MANAGER_ONLY', 'SELECTED_EMPLOYEES', 'HIERARCHY'));

CREATE OR REPLACE FUNCTION public.can_view_document_in_reporting_hierarchy(target_employee_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE reporting_chain(employee_id, manager_id) AS (
    SELECT employee.id, employee.manager_id
    FROM public.employees employee
    WHERE employee.id = ANY(COALESCE(target_employee_ids, ARRAY[]::uuid[]))

    UNION

    SELECT manager.id, manager.manager_id
    FROM public.employees manager
    JOIN reporting_chain child ON manager.id = child.manager_id
  )
  SELECT public.current_employee_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM reporting_chain
      WHERE employee_id = public.current_employee_id()
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_document_in_reporting_hierarchy(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_document_in_reporting_hierarchy(uuid[]) TO authenticated;

DROP POLICY IF EXISTS company_documents_select_authenticated ON public.company_documents;
CREATE POLICY company_documents_select_authenticated
  ON public.company_documents
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('HR', 'SUPER_ADMIN')
    OR visibility = 'ALL'
    OR (visibility = 'MANAGER_ONLY' AND public.current_app_role() = 'MANAGER')
    OR (
      visibility = 'SELECTED_EMPLOYEES'
      AND (
        public.current_app_role() = 'MANAGER'
        OR public.current_employee_id() = ANY(visible_employee_ids)
      )
    )
    OR (
      visibility = 'HIERARCHY'
      AND public.can_view_document_in_reporting_hierarchy(visible_employee_ids)
    )
  );

DROP POLICY IF EXISTS "company documents are viewable by authorized users" ON storage.objects;
CREATE POLICY "company documents are viewable by authorized users"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1
      FROM public.company_documents document
      WHERE document.storage_path = name
        AND (
          public.current_app_role() IN ('HR', 'SUPER_ADMIN')
          OR document.visibility = 'ALL'
          OR (document.visibility = 'MANAGER_ONLY' AND public.current_app_role() = 'MANAGER')
          OR (
            document.visibility = 'SELECTED_EMPLOYEES'
            AND (
              public.current_app_role() = 'MANAGER'
              OR public.current_employee_id() = ANY(document.visible_employee_ids)
            )
          )
          OR (
            document.visibility = 'HIERARCHY'
            AND public.can_view_document_in_reporting_hierarchy(document.visible_employee_ids)
          )
        )
    )
  );