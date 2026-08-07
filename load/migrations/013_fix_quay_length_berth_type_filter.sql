-- Bug found by comparing to the reference pbix's "2.2 Berth Attributes"
-- table: its Quay Length (m) measure only ever summed rows where
-- berthType = 'Berth' (36,297 rows, world total ~7.60M m). Our sum
-- included every berth_type (Anchorage, CBM, SPM, FPSO, Lightering Area,
-- etc.) whose "quay length" (longest polygon edge) is not a real quay --
-- e.g. Anchorage rows average 5,525m, Lightering Area rows average
-- 7,402m -- nearly doubling the true figure (was ~15.67M m). Restrict
-- the quay_length_m sum to berth_type = 'Berth' to match.
create or replace function public.polygons_kpis(p_scope text default 'world', p_value text default null, p_cargo_type text default null)
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
      coalesce(sum(b.quay_length_m) filter (where b.berth_type = 'Berth'), 0) as quay_length_m
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
