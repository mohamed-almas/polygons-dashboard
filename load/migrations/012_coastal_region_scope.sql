-- Coastal Region is another port-master grouping (polygons_ports_master.
-- coastal_region), independent of the Region/Country hierarchy. Added to
-- the same scope chain: port > country > coastal_region > region > world.
create or replace function public.polygons_scope_port_ids(p_scope text, p_value text)
returns table(port_id integer)
language sql stable as $$
  select pm.port_id
  from public.polygons_ports_master pm
  where p_scope = 'world'
     or (p_scope = 'region' and pm.region = p_value)
     or (p_scope = 'country' and pm.country = p_value)
     or (p_scope = 'coastal_region' and pm.coastal_region = p_value)
     or (p_scope = 'port' and pm.port_id = p_value::integer);
$$;
