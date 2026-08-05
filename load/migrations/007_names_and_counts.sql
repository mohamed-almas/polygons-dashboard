-- 1. Geojson RPCs now join polygons_ports_master so names shown on hover
--    come from the master list (not the fact tables' own `port`/`country`
--    columns, which can vary per polygon row for the same physical port).
--    Terminals carry the associated port name; berths carry both the
--    associated port name and (if present) the associated terminal name.
--    This also means a fact-table row whose port_code has no matching
--    master row is now excluded from the map too (same known, accepted
--    ~3-4-row gap already documented for the aggregate matviews).

create or replace function public.polygons_ports_geojson(p_scope text default 'world', p_value text default null)
returns table(id bigint, area_sqm double precision, polygon_name text, port_name text, geom_json text)
language sql stable as $$
  select p.id, p.area_sqm, p.polygon_name, pm.port, ST_AsGeoJSON(p.geom)
  from public.polygons_ports p
  join public.polygons_ports_master pm on pm.port_id = p.port_code
  where p.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

create or replace function public.polygons_terminals_geojson(p_scope text default 'world', p_value text default null)
returns table(id bigint, area_sqm double precision, polygon_name text, port_name text, geom_json text)
language sql stable as $$
  select t.id, t.area_sqm, t.polygon_name, pm.port, ST_AsGeoJSON(t.geom)
  from public.polygons_terminals t
  join public.polygons_ports_master pm on pm.port_id = t.port_code
  where t.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

create or replace function public.polygons_berths_geojson(p_scope text default 'world', p_value text default null)
returns table(id bigint, area_sqm double precision, polygon_name text, port_name text, terminal_name text, geom_json text)
language sql stable as $$
  select
    b.id, b.area_sqm, b.polygon_name, pm.port,
    term.polygon_name as terminal_name,
    ST_AsGeoJSON(b.geom)
  from public.polygons_berths b
  join public.polygons_ports_master pm on pm.port_id = b.port_code
  left join public.polygons_terminals term
    on term.terminal_code = b.terminal_code and term.port_code = b.port_code
  where b.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value));
$$;

-- 2. Port count must be distinct physical ports (by port_code), not raw
--    polygon rows -- a port can have more than one port-level polygon.
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
    select count(distinct port_code) as port_count, coalesce(sum(area_sqm), 0) as given_port_area_sqm
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
