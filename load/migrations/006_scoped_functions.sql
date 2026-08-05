-- Scoped GeoJSON + KPI functions: filter by world / region / country / port.
-- p_scope in ('world','region','country','port'); p_value is the region/country name
-- or port_id (as text) depending on p_scope. p_scope='world' ignores p_value.

create or replace function public.polygons_scope_port_ids(p_scope text, p_value text)
returns table(port_id integer)
language sql stable as $$
  select pm.port_id
  from public.polygons_ports_master pm
  where p_scope = 'world'
     or (p_scope = 'region' and pm.region = p_value)
     or (p_scope = 'country' and pm.country = p_value)
     or (p_scope = 'port' and pm.port_id = p_value::integer);
$$;

create or replace function public.polygons_ports_geojson(p_scope text default 'world', p_value text default null)
returns table(id bigint, area_sqm double precision, polygon_name text, geom_json text)
language sql stable as $$
  select p.id, p.area_sqm, p.polygon_name, ST_AsGeoJSON(p.geom)
  from public.polygons_ports p
  where p.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

create or replace function public.polygons_terminals_geojson(p_scope text default 'world', p_value text default null)
returns table(id bigint, area_sqm double precision, polygon_name text, geom_json text)
language sql stable as $$
  select t.id, t.area_sqm, t.polygon_name, ST_AsGeoJSON(t.geom)
  from public.polygons_terminals t
  where t.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

create or replace function public.polygons_berths_geojson(p_scope text default 'world', p_value text default null)
returns table(id bigint, area_sqm double precision, polygon_name text, geom_json text)
language sql stable as $$
  select b.id, b.area_sqm, b.polygon_name, ST_AsGeoJSON(b.geom)
  from public.polygons_berths b
  where b.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

-- KPI aggregate for the current scope. Three port-area definitions:
--   given_port_area_sqm    = sum(polygons_ports.area_sqm) in scope (the port-polygon-type area itself)
--   physical_area_sqm      = sum(terminal area) + sum(berth area where berth_type = 'Berth')
--   estimated_area_sqm     = sum(terminal area) + sum(berth area, all berth types)
create or replace function public.polygons_kpis(p_scope text default 'world', p_value text default null)
returns table(
  port_count bigint,
  terminal_count bigint,
  berth_count bigint,
  given_port_area_sqm double precision,
  physical_area_sqm double precision,
  estimated_area_sqm double precision,
  quay_length_m double precision
)
language sql stable as $$
  with scope_ports as (
    select port_id from public.polygons_scope_port_ids(p_scope, p_value)
  ),
  port_agg as (
    select count(*) as port_count, coalesce(sum(area_sqm), 0) as given_port_area_sqm
    from public.polygons_ports
    where port_code in (select port_id from scope_ports)
  ),
  terminal_agg as (
    select count(*) as terminal_count, coalesce(sum(area_sqm), 0) as terminal_area_sqm
    from public.polygons_terminals
    where port_code in (select port_id from scope_ports)
  ),
  berth_agg as (
    select
      count(*) as berth_count,
      coalesce(sum(area_sqm) filter (where berth_type = 'Berth'), 0) as berth_area_physical,
      coalesce(sum(area_sqm), 0) as berth_area_all,
      coalesce(sum(quay_length_m), 0) as quay_length_m
    from public.polygons_berths
    where port_code in (select port_id from scope_ports)
  )
  select
    port_agg.port_count,
    terminal_agg.terminal_count,
    berth_agg.berth_count,
    port_agg.given_port_area_sqm,
    terminal_agg.terminal_area_sqm + berth_agg.berth_area_physical as physical_area_sqm,
    terminal_agg.terminal_area_sqm + berth_agg.berth_area_all as estimated_area_sqm,
    berth_agg.quay_length_m
  from port_agg, terminal_agg, berth_agg;
$$;

-- Bounding box for a scope, for map auto-zoom (port-level master lat/lon points).
create or replace function public.polygons_scope_bbox(p_scope text default 'world', p_value text default null)
returns table(min_lon double precision, min_lat double precision, max_lon double precision, max_lat double precision)
language sql stable as $$
  select min(lon), min(lat), max(lon), max(lat)
  from public.polygons_ports_master
  where port_id in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

revoke execute on function public.polygons_scope_port_ids(text, text) from public;
revoke execute on function public.polygons_kpis(text, text) from public;
revoke execute on function public.polygons_scope_bbox(text, text) from public;
grant execute on function public.polygons_scope_port_ids(text, text) to anon, authenticated, service_role;
grant execute on function public.polygons_kpis(text, text) to anon, authenticated, service_role;
grant execute on function public.polygons_scope_bbox(text, text) to anon, authenticated, service_role;
