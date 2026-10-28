-- Supabase's "automatic RLS" helper runs from an event trigger whenever a table is created.
-- Nobody should call it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
