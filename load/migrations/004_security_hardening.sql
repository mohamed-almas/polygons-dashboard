-- load/migrations/004_security_hardening.sql

-- polygons_calc_berth_edges() recomputes geometry stats (quay_length_m,
-- perimeter_m, sides_count) over all ~39k berth polygons. Supabase grants
-- EXECUTE on public functions to anon/authenticated by default, which would
-- let anyone trigger this expensive recompute via the public API even
-- though RLS blocks them from seeing the resulting UPDATE. Restrict it to
-- roles that actually need it (service_role, used by load.py, retains
-- EXECUTE implicitly as it bypasses grants).
revoke execute on function public.polygons_calc_berth_edges() from anon, authenticated;

-- Dedicated refresh function for the two aggregate matviews, callable by
-- load.py's service-role client (which bypasses the revoke below via
-- security definer + role privilege). Replaces the previous approach of
-- calling a nonexistent "exec_sql" RPC, which always failed silently.
create or replace function public.polygons_refresh_aggregates()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view public.polygons_agg_country;
  refresh materialized view public.polygons_agg_region;
end;
$$;

revoke execute on function public.polygons_refresh_aggregates() from anon, authenticated;
