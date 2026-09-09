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
  );
--> statement-breakpoint

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
        )
    )
  );