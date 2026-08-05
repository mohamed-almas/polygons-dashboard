-- load/migrations/003_geojson_rpc.sql
create or replace function public.polygons_ports_geojson()
returns table(id bigint, area_sqm double precision, polygon_name text, geom_json text)
language sql stable as $$
  select id, area_sqm, polygon_name, ST_AsGeoJSON(geom) from public.polygons_ports;
$$;

create or replace function public.polygons_terminals_geojson()
returns table(id bigint, area_sqm double precision, polygon_name text, geom_json text)
language sql stable as $$
  select id, area_sqm, polygon_name, ST_AsGeoJSON(geom) from public.polygons_terminals;
$$;

create or replace function public.polygons_berths_geojson()
returns table(id bigint, area_sqm double precision, polygon_name text, geom_json text)
language sql stable as $$
  select id, area_sqm, polygon_name, ST_AsGeoJSON(geom) from public.polygons_berths;
$$;
