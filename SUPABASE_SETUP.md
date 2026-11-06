# Supabase authentication and audit setup

1. Create a Supabase project and configure the site URL and allowed redirect URLs.
2. Apply the SQL migrations in `supabase/migrations/` in filename order.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.example`. The anon key is intended for browser use; never put a `service_role` key in the frontend.
4. Create the first administrator through the Supabase Auth dashboard, then insert a matching `user_profiles` row using the SQL editor. Apply `202611060001_username_login_and_user_management.sql` before using username-based accounts created by the administrator screen.
5. Test each role with separate accounts. Missing profiles and unknown roles fail closed.

The client uses Supabase Auth for sign-in and reads each role from `user_profiles` using the authenticated `user_id`. Auth sessions remain in memory only, so users must sign in again after reloading the page. ERP data stores are queried directly from and upserted to `app_data_stores`, scoped by `(user_id, key)` and protected by row-level security. Data loading and saving require a connection to Supabase; the client does not cache or queue ERP data on the device. Requests use an 8-second timeout.

The user-management view reads `user_profiles`. Apply `202611020002_user_management_profiles.sql` to sync email, Auth account creation time, and confirmation/ban status from `auth.users`. The administrator screen creates Supabase Auth users with a generated `<username>@erp.local` address; users sign in with their username and password. The username migration auto-confirms only these internal addresses and forces public sign-ups to the lowest-privilege role; selected roles are assigned only by an authenticated administrator.

For a fresh project, apply migrations in filename order. On a project with the existing auth/profile and daily-log migrations, apply `202611030002_user_scoped_app_data.sql` to finish with per-user isolation; it works whether or not the intermediate `202611030001_tenant_aware_app_data.sql` schema was applied. The migration removes `user_profiles.organization_id`, changes data-store access to `(user_id, key)`, and enforces per-user RLS. It copies each existing organization data-store snapshot to the profiles that belonged to that organization, so each existing account starts with a copy and later changes are isolated. Existing daily logs are assigned by matching their email to a profile; unmatched legacy rows remain inaccessible to ordinary accounts. UI permission checks are not a security boundary.

If audit writes report an error for `write_audit_log` or a missing `audit_logs` column, apply `202611030003_fix_audit_log_rpc_ambiguity.sql` and then `202611030006_reconcile_audit_logs_schema.sql` in the Supabase SQL Editor. The latter ensures all columns used by the RPC exist, backfills legacy rows, creates required indexes, and requests a PostgREST schema-cache reload. After it succeeds, reload the app. Migrations `202611030004_add_audit_event_id.sql` and `202611030005_add_audit_actor_user_id.sql` were incremental fixes and are no longer needed if `202611030006_reconcile_audit_logs_schema.sql` has been run.

The current form data model stores each dataset as a JSON array in `app_data_stores`; it does not use separate relational header/detail tables for expenses or inventory slips. For example, expense headers use the `ExpenseItem` properties (`date`, `amount`, `supplierName`, `supplierTaxCode`, `supplierZalo`, `vatRatePercent`, `vatAmount`, `paymentMethod`, `paidAmount`, and related fields), while `items` contains `name`, `quantity`, `unit`, `unitPrice`, and `amount`. Data stores, daily logs, and audit events are scoped to the authenticated user ID.

Image uploads still use the separate Google Drive upload service. They are not used for ERP data-store reads or writes.

Audit events are written directly through the `write_audit_log` RPC and read from `audit_logs` in Supabase. The RPC derives the actor and role from the authenticated Supabase user/profile. Admins can read their server-side audit events; events are append-only for application clients.
