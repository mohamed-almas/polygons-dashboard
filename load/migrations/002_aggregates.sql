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

create materialized view public.polygons_agg_country as
select
  pm.country as group_key,
  count(distinct po.id) as port_count,
  count(distinct te.id) as terminal_count,
  count(distinct be.id) as berth_count,
  coalesce(sum(distinct_port_area.area_sqm), 0) as port_area_sqm,
  coalesce(sum(te.area_sqm), 0) as terminal_area_sqm,
  coalesce(sum(be.area_sqm), 0) as berth_area_sqm,
  coalesce(sum(be.quay_length_m), 0) as quay_length_m
from public.polygons_ports_master pm
left join public.polygons_ports po on po.port_code = pm.port_id
left join (select distinct on (id) id, area_sqm from public.polygons_ports) distinct_port_area
  on distinct_port_area.id = po.id
left join public.polygons_terminals te on te.port_code = pm.port_id
left join public.polygons_berths be on be.port_code = pm.port_id
group by pm.country;

create materialized view public.polygons_agg_region as
select
  pm.region as group_key,
  count(distinct po.id) as port_count,
  count(distinct te.id) as terminal_count,
  count(distinct be.id) as berth_count,
  coalesce(sum(distinct_port_area.area_sqm), 0) as port_area_sqm,
  coalesce(sum(te.area_sqm), 0) as terminal_area_sqm,
  coalesce(sum(be.area_sqm), 0) as berth_area_sqm,
  coalesce(sum(be.quay_length_m), 0) as quay_length_m
from public.polygons_ports_master pm
left join public.polygons_ports po on po.port_code = pm.port_id
left join (select distinct on (id) id, area_sqm from public.polygons_ports) distinct_port_area
  on distinct_port_area.id = po.id
left join public.polygons_terminals te on te.port_code = pm.port_id
left join public.polygons_berths be on be.port_code = pm.port_id
group by pm.region;

create unique index polygons_agg_country_key_idx on public.polygons_agg_country (group_key);
create unique index polygons_agg_region_key_idx on public.polygons_agg_region (group_key);
