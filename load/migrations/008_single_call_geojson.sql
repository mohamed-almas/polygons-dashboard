-- PostgREST caps SETOF-returning RPC responses at its configured row limit
-- (1000 here), which forced the frontend into ~40 sequential paginated
-- calls to fetch all 39k berths. Returning a single `json` value instead
-- (one aggregated array, not a set of rows) bypasses that cap entirely --
-- one HTTP round-trip per level regardless of scope size.

drop function if exists public.polygons_ports_geojson(text, text);
drop function if exists public.polygons_terminals_geojson(text, text);
drop function if exists public.polygons_berths_geojson(text, text);

create function public.polygons_ports_geojson(p_scope text default 'world', p_value text default null)
returns json
language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'area_sqm', p.area_sqm,
    'polygon_name', p.polygon_name,
    'port_name', pm.port,
    'geom_json', ST_AsGeoJSON(p.geom)
  )), '[]'::json)
  from public.polygons_ports p
  join public.polygons_ports_master pm on pm.port_id = p.port_code
  where p.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

create function public.polygons_terminals_geojson(p_scope text default 'world', p_value text default null)
returns json
language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'id', t.id,
    'area_sqm', t.area_sqm,
    'polygon_name', t.polygon_name,
    'port_name', pm.port,
    'geom_json', ST_AsGeoJSON(t.geom)
  )), '[]'::json)
  from public.polygons_terminals t
  join public.polygons_ports_master pm on pm.port_id = t.port_code
  where t.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

create function public.polygons_berths_geojson(p_scope text default 'world', p_value text default null)
returns json
language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'id', b.id,
    'area_sqm', b.area_sqm,
    'polygon_name', b.polygon_name,
    'port_name', pm.port,
    'terminal_name', term.polygon_name,
    'geom_json', ST_AsGeoJSON(b.geom)
  )), '[]'::json)
  from public.polygons_berths b
  join public.polygons_ports_master pm on pm.port_id = b.port_code
  left join public.polygons_terminals term
    on term.terminal_code = b.terminal_code and term.port_code = b.port_code
  where b.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

revoke execute on function public.polygons_ports_geojson(text, text) from public;
revoke execute on function public.polygons_terminals_geojson(text, text) from public;
revoke execute on function public.polygons_berths_geojson(text, text) from public;
grant execute on function public.polygons_ports_geojson(text, text) to anon, authenticated, service_role;
grant execute on function public.polygons_terminals_geojson(text, text) to anon, authenticated, service_role;
grant execute on function public.polygons_berths_geojson(text, text) to anon, authenticated, service_role;
