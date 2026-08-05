-- load/migrations/001_schema.sql
create extension if not exists postgis;

create table public.polygons_ports_master (
  port_id integer primary key,
  port text,
  country text,
  iso2_code text,
  iso3_code text,
  coastal_region text,
  clarksons_region text,
  region text,
  lat double precision,
  lon double precision
);

create table public.polygons_ports (
  id bigint primary key,
  port_code integer,
  country text,
  port text,
  unlocode text,
  parent_port_code integer,
  parent_port text,
  polygon_name text,
  geom geometry(Polygon, 4326) not null,
  area_sqm double precision
);
create index polygons_ports_geom_idx on public.polygons_ports using gist (geom);
create index polygons_ports_port_code_idx on public.polygons_ports (port_code);

create table public.polygons_terminals (
  id bigint primary key,
  port_code integer,
  terminal_code integer,
  terminal_type text,
  polygon_name text,
  geom geometry(Polygon, 4326) not null,
  area_sqm double precision
);
create index polygons_terminals_geom_idx on public.polygons_terminals using gist (geom);
create index polygons_terminals_port_code_idx on public.polygons_terminals (port_code);

create table public.polygons_berths (
  id bigint primary key,
  port_code integer,
  terminal_code integer,
  berth_code integer,
  berth_type text,
  polygon_name text,
  geom geometry(Polygon, 4326) not null,
  area_sqm double precision,
  quay_length_m double precision,
  perimeter_m double precision,
  sides_count integer
);
create index polygons_berths_geom_idx on public.polygons_berths using gist (geom);
create index polygons_berths_port_code_idx on public.polygons_berths (port_code);

alter table public.polygons_ports_master enable row level security;
alter table public.polygons_ports enable row level security;
alter table public.polygons_terminals enable row level security;
alter table public.polygons_berths enable row level security;

create policy "public read" on public.polygons_ports_master for select using (true);
create policy "public read" on public.polygons_ports for select using (true);
create policy "public read" on public.polygons_terminals for select using (true);
create policy "public read" on public.polygons_berths for select using (true);
