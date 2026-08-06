import { supabase } from './supabaseClient.js'
import { formatCompact, formatArea } from './format.js'

export async function renderKpiCards(scope, value) {
  const { data, error } = await supabase.rpc('polygons_kpis', { p_scope: scope, p_value: value }).single()
  if (error) throw error

  const container = document.getElementById('kpi-cards')
  container.innerHTML = `
    <div class="kpi-card"><div class="kpi-value">${formatCompact(data.port_count)}</div><div class="kpi-label">Ports</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatCompact(data.terminal_count)}</div><div class="kpi-label">Terminals</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatCompact(data.berth_count)}</div><div class="kpi-label">Berths</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatArea(data.given_port_area_sqm)}</div><div class="kpi-label">Designated Port Area</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatArea(data.physical_area_sqm)}</div><div class="kpi-label">Physical Port Area</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatArea(data.estimated_area_sqm)}</div><div class="kpi-label">Harbor Area / Port Limits</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatCompact(data.quay_length_m)}</div><div class="kpi-label">Quay length (m)</div></div>
  `
}
