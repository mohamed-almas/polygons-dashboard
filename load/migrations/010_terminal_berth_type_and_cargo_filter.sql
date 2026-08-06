-- Add terminal_type to the terminal tooltip payload plus an optional cargo
-- type filter, and berth_type + associated terminal_type to the berth
-- tooltip payload (terminal_type only present when the berth actually sits
-- under a terminal).

drop function if exists public.polygons_terminals_geojson(text, text);
drop function if exists public.polygons_berths_geojson(text, text);

create function public.polygons_terminals_geojson(p_scope text default 'world', p_value text default null, p_cargo_type text default null)
returns json
language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'id', t.id,
    'area_sqm', t.area_sqm,
    'polygon_name', t.polygon_name,
    'port_name', pm.port,
    'terminal_type', t.terminal_type,
    'geom_json', ST_AsGeoJSON(t.geom)
  )), '[]'::json)
  from public.polygons_terminals t
  join public.polygons_ports_master pm on pm.port_id = t.port_code
  where t.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value))
    and (p_cargo_type is null or t.terminal_type = p_cargo_type);
$$;

create function public.polygons_berths_geojson(p_scope text default 'world', p_value text default null)
returns json
language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'id', b.id,
    'area_sqm', b.area_sqm,
    'polygon_name', b.polygon_name,
    'port_name', pm.port,
    'berth_type', b.berth_type,
    'terminal_name', (
      select term.polygon_name
      from public.polygons_terminals term
      where term.terminal_code = b.terminal_code and term.port_code = b.port_code
      limit 1
    ),
    'terminal_type', (
      select term.terminal_type
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

revoke execute on function public.polygons_terminals_geojson(text, text, text) from public;
revoke execute on function public.polygons_berths_geojson(text, text) from public;
grant execute on function public.polygons_terminals_geojson(text, text, text) to anon, authenticated, service_role;
grant execute on function public.polygons_berths_geojson(text, text) to anon, authenticated, service_role;
