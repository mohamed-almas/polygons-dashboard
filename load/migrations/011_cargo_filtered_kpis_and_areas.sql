-- 1. polygons_kpis gains an optional p_cargo_type filter (terminals of a
--    non-matching type excluded from terminal_count/terminal_area, and
--    berths whose terminal doesn't match are excluded from
--    berth_count/berth_area/quay_length -- berths with no matching terminal
--    at all are excluded too, since they can't be said to match a cargo
--    type when one is being filtered on).
-- 2. Adds terminal_area_sqm and berth_area_sqm (all berth types) as their
--    own KPI fields, for the new Terminal Area / Berth Area cards.
-- 3. polygons_berths_geojson gains the same p_cargo_type filter so the map
--    also drops berths under a filtered-out terminal.

drop function if exists public.polygons_kpis(text, text);
drop function if exists public.polygons_berths_geojson(text, text);

create function public.polygons_kpis(p_scope text default 'world', p_value text default null, p_cargo_type text default null)
returns table(
  port_count bigint,
  terminal_count bigint,
  berth_count bigint,
  given_port_area_sqm double precision,
  physical_area_sqm double precision,
  estimated_area_sqm double precision,
  terminal_area_sqm double precision,
  berth_area_sqm double precision,
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
      and (p_cargo_type is null or terminal_type = p_cargo_type)
  ),
  berth_agg as (
    select
      count(*) as berth_count,
      coalesce(sum(b.area_sqm) filter (where b.berth_type = 'Berth'), 0) as berth_area_physical,
      coalesce(sum(b.area_sqm), 0) as berth_area_all,
      coalesce(sum(b.quay_length_m), 0) as quay_length_m
    from public.polygons_berths b
    where b.port_code in (select port_id from scope_ports)
      and (
        p_cargo_type is null
        or exists (
          select 1 from public.polygons_terminals term
          where term.terminal_code = b.terminal_code and term.port_code = b.port_code
            and term.terminal_type = p_cargo_type
        )
      )
  )
  select
    port_agg.port_count,
    terminal_agg.terminal_count,
    berth_agg.berth_count,
    port_agg.given_port_area_sqm,
    terminal_agg.terminal_area_sqm + berth_agg.berth_area_physical as physical_area_sqm,
    terminal_agg.terminal_area_sqm + berth_agg.berth_area_all as estimated_area_sqm,
    terminal_agg.terminal_area_sqm,
    berth_agg.berth_area_all as berth_area_sqm,
    berth_agg.quay_length_m
  from port_agg, terminal_agg, berth_agg;
$$;

create function public.polygons_berths_geojson(p_scope text default 'world', p_value text default null, p_cargo_type text default null)
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
  where b.port_code in (select port_id from public.polygons_scope_port_ids(p_scope, p_value))
    and (
      p_cargo_type is null
      or exists (
        select 1 from public.polygons_terminals term
        where term.terminal_code = b.terminal_code and term.port_code = b.port_code
          and term.terminal_type = p_cargo_type
      )
    );
$$;

revoke execute on function public.polygons_kpis(text, text, text) from public;
revoke execute on function public.polygons_berths_geojson(text, text, text) from public;
grant execute on function public.polygons_kpis(text, text, text) to anon, authenticated, service_role;
grant execute on function public.polygons_berths_geojson(text, text, text) to anon, authenticated, service_role;
