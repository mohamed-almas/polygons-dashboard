import { supabase } from './supabaseClient.js'

async function fetchAggregate(scope, groupKey) {
  if (scope === 'global') {
    const { data, error } = await supabase.from('polygons_agg_country').select('*')
    if (error) throw error
    return data.reduce((acc, row) => ({
      port_count: acc.port_count + row.port_count,
      terminal_count: acc.terminal_count + row.terminal_count,
      berth_count: acc.berth_count + row.berth_count,
      port_area_sqm: acc.port_area_sqm + row.port_area_sqm,
      terminal_area_sqm: acc.terminal_area_sqm + row.terminal_area_sqm,
      berth_area_sqm: acc.berth_area_sqm + row.berth_area_sqm,
      quay_length_m: acc.quay_length_m + row.quay_length_m,
    }), { port_count: 0, terminal_count: 0, berth_count: 0, port_area_sqm: 0, terminal_area_sqm: 0, berth_area_sqm: 0, quay_length_m: 0 })
  }

  const table = scope === 'region' ? 'polygons_agg_region' : 'polygons_agg_country'
  const { data, error } = await supabase.from(table).select('*').eq('group_key', groupKey).single()
  if (error) throw error
  return data
}

function fmt(n) {
  return Math.round(n).toLocaleString()
}

export async function renderKpiCards(scope, groupKey) {
  const agg = await fetchAggregate(scope, groupKey)
  const container = document.getElementById('kpi-cards')
  container.innerHTML = `
    <div class="kpi-card"><div class="kpi-value">${fmt(agg.port_count)}</div><div class="kpi-label">Ports</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(agg.terminal_count)}</div><div class="kpi-label">Terminals</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(agg.berth_count)}</div><div class="kpi-label">Berths</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(agg.port_area_sqm)}</div><div class="kpi-label">Port area (sqm)</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(agg.quay_length_m)}</div><div class="kpi-label">Quay length (m)</div></div>
  `
}
