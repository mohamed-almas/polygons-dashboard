-- load/migrations/002_aggregates.sql

-- Computes quay_length_m (longest edge of the berth polygon, in meters),
-- perimeter_m, and sides_count from each berth's geometry.
create or replace function public.polygons_calc_berth_edges()
returns void language plpgsql as $$
begin
  update public.polygons_berths b
  set quay_length_m = e.max_len,
      perimeter_m = e.perimeter,
      sides_count = e.n_sides
  from (
    select id,
           max(seg_len) as max_len,
           sum(seg_len) as perimeter,
           count(*) as n_sides
    from (
      select id,
             ST_Distance(
               geography(pt),
               geography(lead(pt) over (partition by id order by path))
             ) as seg_len
      from (
        select id, (dp).path[1] as path, (dp).geom as pt
        from (
          select id, ST_DumpPoints(ST_ExteriorRing(geom)) as dp
          from public.polygons_berths
        ) s
      ) pts
    ) segs
    where seg_len is not null
    group by id
  ) e
  where b.id = e.id;
end;
$$;

drop materialized view if exists public.polygons_agg_country;
drop materialized view if exists public.polygons_agg_region;

-- Pre-aggregate each child table per port_code first, to avoid a cartesian
-- fan-out when a port has multiple terminals AND multiple berths (joining
-- both raw per-row tables into the same flat SELECT would multiply sums).
create materialized view public.polygons_agg_country as
with port_agg as (
  select port_code, count(*) as port_count, sum(area_sqm) as port_area_sqm
  from public.polygons_ports
  group by port_code
),
terminal_agg as (
  select port_code, count(*) as terminal_count, sum(area_sqm) as terminal_area_sqm
  from public.polygons_terminals
  group by port_code
),
berth_agg as (
  select port_code, count(*) as berth_count, sum(area_sqm) as berth_area_sqm, sum(quay_length_m) as quay_length_m
  from public.polygons_berths
  group by port_code
)
select
  pm.country as group_key,
  coalesce(sum(pa.port_count), 0) as port_count,
  coalesce(sum(ta.terminal_count), 0) as terminal_count,
  coalesce(sum(ba.berth_count), 0) as berth_count,
  coalesce(sum(pa.port_area_sqm), 0) as port_area_sqm,
  coalesce(sum(ta.terminal_area_sqm), 0) as terminal_area_sqm,
  coalesce(sum(ba.berth_area_sqm), 0) as berth_area_sqm,
  coalesce(sum(ba.quay_length_m), 0) as quay_length_m
from public.polygons_ports_master pm
left join port_agg pa on pa.port_code = pm.port_id
left join terminal_agg ta on ta.port_code = pm.port_id
left join berth_agg ba on ba.port_code = pm.port_id
group by pm.country;

create materialized view public.polygons_agg_region as
with port_agg as (
  select port_code, count(*) as port_count, sum(area_sqm) as port_area_sqm
  from public.polygons_ports
  group by port_code
),
terminal_agg as (
  select port_code, count(*) as terminal_count, sum(area_sqm) as terminal_area_sqm
  from public.polygons_terminals
  group by port_code
),
berth_agg as (
  select port_code, count(*) as berth_count, sum(area_sqm) as berth_area_sqm, sum(quay_length_m) as quay_length_m
  from public.polygons_berths
  group by port_code
)
select
  pm.region as group_key,
  coalesce(sum(pa.port_count), 0) as port_count,
  coalesce(sum(ta.terminal_count), 0) as terminal_count,
  coalesce(sum(ba.berth_count), 0) as berth_count,
  coalesce(sum(pa.port_area_sqm), 0) as port_area_sqm,
  coalesce(sum(ta.terminal_area_sqm), 0) as terminal_area_sqm,
  coalesce(sum(ba.berth_area_sqm), 0) as berth_area_sqm,
  coalesce(sum(ba.quay_length_m), 0) as quay_length_m
from public.polygons_ports_master pm
left join port_agg pa on pa.port_code = pm.port_id
left join terminal_agg ta on ta.port_code = pm.port_id
left join berth_agg ba on ba.port_code = pm.port_id
group by pm.region;

create unique index polygons_agg_country_key_idx on public.polygons_agg_country (group_key);
create unique index polygons_agg_region_key_idx on public.polygons_agg_region (group_key);
