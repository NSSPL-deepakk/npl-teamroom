-- Add role-aware visibility to the company document repository.

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS is_visible_to_all boolean NOT NULL DEFAULT true;
--> statement-breakpoint

DROP POLICY IF EXISTS company_documents_select_authenticated ON public.company_documents;
CREATE POLICY company_documents_select_authenticated
  ON public.company_documents
  FOR SELECT TO authenticated
  USING (
    is_visible_to_all
    OR (
      public.can_manage_work_modules()
      AND public.current_app_role() IN ('HR', 'SUPER_ADMIN')
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "company documents are viewable by authenticated users" ON storage.objects;
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
          document.is_visible_to_all
          OR (
            public.can_manage_work_modules()
            AND public.current_app_role() IN ('HR', 'SUPER_ADMIN')
          )
        )
    )
  );
--> statement-breakpoint