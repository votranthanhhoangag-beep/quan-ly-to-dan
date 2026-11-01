# Supabase authentication and audit setup

1. Create a Supabase project and configure the site URL and allowed redirect URLs.
2. Apply `supabase/migrations/202611010001_auth_profiles_and_audit_logs.sql`.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.example`. The anon key is intended for browser use; never put a `service_role` key in the frontend.
4. Create the first administrator through the Supabase Auth dashboard, then insert a matching `user_profiles` row using the SQL editor. Create other users through an approved administrator workflow and assign roles server-side.
5. Test each role with separate accounts. Missing profiles and unknown roles fail closed.

The client uses Supabase Auth for sign-in and reads each role from `user_profiles`. UI permission checks and the local audit log are not a security boundary. Existing ERP data is still stored through the Google Apps Script endpoint; that endpoint must independently authenticate users and enforce the same authorization rules before production. Until then, a user can bypass client-side guards by calling the endpoint directly.

Audit events are kept in browser local storage and sent to the `write_audit_log` RPC. The RPC derives the actor and role from the authenticated Supabase user/profile. Only admins can read the server audit table; events are append-only for application clients.
