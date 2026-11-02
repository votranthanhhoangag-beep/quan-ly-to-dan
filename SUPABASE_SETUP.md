# Supabase authentication and audit setup

1. Create a Supabase project and configure the site URL and allowed redirect URLs.
2. Apply the SQL migrations in `supabase/migrations/` in filename order.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.example`. The anon key is intended for browser use; never put a `service_role` key in the frontend.
4. Create the first administrator through the Supabase Auth dashboard, then insert a matching `user_profiles` row using the SQL editor. Create other users through an approved administrator workflow and assign roles server-side.
5. Test each role with separate accounts. Missing profiles and unknown roles fail closed.

The client uses Supabase Auth for sign-in and reads each role from `user_profiles`. ERP data stores are read from and upserted to `app_data_stores`; create the table with `key text primary key`, `data jsonb`, and `updated_at timestamptz` before using the application. The client uses an 8-second request timeout and keeps a local cache for offline access.

The user-management view reads `user_profiles`. Apply `202611020002_user_management_profiles.sql` to sync email, Auth account creation time, and confirmation/ban status from `auth.users`. Auth account creation and deletion are intentionally not exposed to the browser client; use a trusted server-side Admin API for those operations.

Enable row-level security on `app_data_stores` and add policies that enforce the application's actual tenant membership and role rules. The current `key`-only schema has no tenant boundary: a policy that grants access to every authenticated user would expose all tenants' data. The existing `user_profiles` migration also has no tenant membership, so do not deploy this shared store in a multi-tenant environment until tenant-aware schema and RLS policies are in place. UI permission checks and the local audit log are not a security boundary.

Image uploads still use the separate Google Drive upload service. They are not used for ERP data-store reads or writes.

Audit events are kept in browser local storage and sent to the `write_audit_log` RPC. The RPC derives the actor and role from the authenticated Supabase user/profile. Only admins can read the server audit table; events are append-only for application clients.
