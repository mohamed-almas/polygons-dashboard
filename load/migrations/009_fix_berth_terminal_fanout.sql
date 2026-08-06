-- polygons_terminals has duplicate (port_code, terminal_code) pairs for a
-- handful of terminals, so the berths_geojson left join to it was fanning
-- out (39449 berth features returned instead of the real 39170 rows).
-- Use a scalar subquery instead of a join so each berth contributes exactly
-- one row regardless of duplicate terminal rows.

create or replace function public.polygons_berths_geojson(p_scope text default 'world', p_value text default null)
returns json
language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'id', b.id,
    'area_sqm', b.area_sqm,
    'polygon_name', b.polygon_name,
    'port_name', pm.port,
    'terminal_name', (
      select term.polygon_name
      from public.polygons_terminals term
      where term.terminal_code = b.terminal_code and term.port_code = b.port_code
      limit 1
    ),
    'geom_json', ST_AsGeoJSON(b.geom)
  )), '[]'::json)
  from public.polygons_berths b
  join public.polygons_ports_master pm on pm.port_id = b.port_code
  where b.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

revoke execute on function public.polygons_berths_geojson(text, text) from public;
grant execute on function public.polygons_berths_geojson(text, text) to anon, authenticated, service_role;
