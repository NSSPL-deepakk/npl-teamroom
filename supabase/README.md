# Supabase

Not yet provisioned. Per Phase 1 §2 of the project spec, this project needs:

- A Supabase project with PostgreSQL, Auth, and Storage enabled.
- Row Level Security (RLS) policies per table, scoped by role
  (`SUPER_ADMIN` / `HR` / `MANAGER` / `EMPLOYEE`) and by ownership
  (e.g. an employee can read their own attendance/leave rows; a manager
  can read their team's).
- Storage buckets: `resumes/`, `employee-documents/`, `hr-documents/`,
  `offer-letters/`.

Suggested layout once provisioned:
```
supabase/
├── migrations/       -- SQL migrations (schema, RLS policies)
├── seed.sql          -- demo/reference data
└── config.toml        -- Supabase CLI config
```

Employee account creation uses the Edge Function at
`supabase/functions/create-employee-account`. Deploy it with the Supabase CLI
and set its `SUPABASE_SERVICE_ROLE_KEY` secret. Never expose that secret in
the web application's environment variables.

Email notifications use the Edge Function at
`supabase/functions/send-email-notification`. Deploy it with:

```bash
supabase functions deploy send-email-notification
supabase secrets set RESEND_API_KEY=... RESEND_FROM_EMAIL=...
```

The in-app notification table, recipient triggers, RLS policies, and Realtime
publication are created by the `db/migrations/0022_notifications.sql`
migration. From the `db/` directory, configure `DATABASE_URL` with the
Supabase PostgreSQL connection string and run:

```bash
npm install
npm run db:migrate
```

Apply this migration before opening the notification bell. Creating an
announcement or submitting leave then creates the in-app notification row;
the web client also invokes the Edge Function to send the corresponding
Resend email.

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are server-side secrets. The function
uses the authenticated request plus the service-role client to resolve active
employees and HR/Admin recipients. The existing `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets must also be
available to the function. Email delivery errors are logged and do not change
the successful database save.
