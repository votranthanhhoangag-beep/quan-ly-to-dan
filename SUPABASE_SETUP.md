# Supabase authentication and audit setup

1. Create a Supabase project and configure the site URL and allowed redirect URLs.
2. Apply the SQL migrations in `supabase/migrations/` in filename order.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.example`. The anon key is intended for browser use; never put a `service_role` key in the frontend.
4. Create the first administrator through the Supabase Auth dashboard, then insert a matching `user_profiles` row using the SQL editor. Create other users through an approved administrator workflow and assign roles server-side.
5. Test each role with separate accounts. Missing profiles and unknown roles fail closed.

The client uses Supabase Auth for sign-in and reads each role and organization from `user_profiles`. ERP data stores are read from and upserted to `app_data_stores`, scoped by `organization_id` and `key`. The tenant migration creates this table if needed, migrates existing profiles and store rows to the default organization, and installs organization-scoped row-level security policies. Existing users and their shared company data remain together in `Công ty hiện tại`; assign users to another organization through a trusted administrative process before moving their data. A new account has no organization until it completes `register_new_tenant` (which creates an isolated organization and grants that account its initial admin role) or an existing organization admin assigns it. Self-service tenant registration requires Supabase Auth sign-up to return a session; if email confirmation is enabled, provision the tenant through a trusted server-side flow after confirmation instead. The client uses an 8-second request timeout and keeps a tenant-scoped local cache for offline access.

The user-management view reads `user_profiles`. Apply `202611020002_user_management_profiles.sql` to sync email, Auth account creation time, and confirmation/ban status from `auth.users`. Auth account creation and deletion are intentionally not exposed to the browser client; use a trusted server-side Admin API for those operations.

Apply `202611030001_tenant_aware_app_data.sql` after the existing migrations. It backfills the current shared data to the default organization, then enforces tenant boundaries in Supabase RLS. Creating additional organizations and assigning profiles to them must be done through a trusted administrative process; browser clients cannot change their own organization. UI permission checks and the local audit log are not a security boundary.

The current form data model stores each dataset as a JSON array in `app_data_stores`; it does not use separate relational header/detail tables for expenses or inventory slips. For example, expense headers use the `ExpenseItem` properties (`date`, `amount`, `supplierName`, `supplierTaxCode`, `supplierZalo`, `vatRatePercent`, `vatAmount`, `paymentMethod`, `paidAmount`, and related fields), while `items` contains `name`, `quantity`, `unit`, `unitPrice`, and `amount`. The tenant migration scopes these snapshots by `organization_id`; `daily_logs` also records `user_id` and `organization_id` directly.

Image uploads still use the separate Google Drive upload service. They are not used for ERP data-store reads or writes.

Audit events are kept in browser local storage and sent to the `write_audit_log` RPC. The RPC derives the actor, role, and organization from the authenticated Supabase user/profile. Only admins can read audit events from their own organization; events are append-only for application clients.
