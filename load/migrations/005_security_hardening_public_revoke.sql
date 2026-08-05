-- load/migrations/005_security_hardening_public_revoke.sql

-- Follow-up to 004_security_hardening.sql: PostgreSQL functions are granted
-- EXECUTE to the PUBLIC pseudo-role by default at creation time. Revoking
-- from the named roles anon/authenticated alone does not remove that PUBLIC
-- grant, and anon/authenticated still get EXECUTE through it (verified via
-- information_schema.routine_privileges after applying 004). Revoke from
-- PUBLIC too so the 004 restriction is actually effective.
revoke execute on function public.polygons_calc_berth_edges() from public;
revoke execute on function public.polygons_refresh_aggregates() from public;

-- service_role and postgres need an explicit re-grant since they were not
-- otherwise members of a role that retains EXECUTE after the PUBLIC revoke.
grant execute on function public.polygons_calc_berth_edges() to service_role, postgres;
grant execute on function public.polygons_refresh_aggregates() to service_role, postgres;
