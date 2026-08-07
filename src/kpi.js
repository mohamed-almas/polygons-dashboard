import { supabase } from './supabaseClient.js'
import { formatCompact, formatArea, formatCount } from './format.js'

export async function renderKpiCards(scope, value, cargoType) {
  const { data, error } = await supabase
    .rpc('polygons_kpis', { p_scope: scope, p_value: value, p_cargo_type: cargoType || null })
    .single()
  if (error) throw error

  const container = document.getElementById('kpi-cards')
  container.innerHTML = `
    <div class="kpi-group">
      <div class="kpi-card"><div class="kpi-value">${formatCount(data.port_count)}</div><div class="kpi-label">Ports</div></div>
      <div class="kpi-card"><div class="kpi-value">${formatArea(data.given_port_area_sqm)}</div><div class="kpi-label">Designated Port Area</div></div>
      <div class="kpi-card"><div class="kpi-value">${formatArea(data.physical_area_sqm)}</div><div class="kpi-label">Wharf Area</div></div>
      <div class="kpi-card"><div class="kpi-value">${formatArea(data.estimated_area_sqm)}</div><div class="kpi-label">Port Limits / Harbor Area</div></div>
    </div>
    <div class="kpi-group">
      <div class="kpi-card"><div class="kpi-value">${formatCount(data.terminal_count)}</div><div class="kpi-label">Terminals</div></div>
      <div class="kpi-card"><div class="kpi-value">${formatArea(data.terminal_area_sqm)}</div><div class="kpi-label">Terminals Area</div></div>
    </div>
    <div class="kpi-group">
      <div class="kpi-card"><div class="kpi-value">${formatCount(data.berth_count)}</div><div class="kpi-label">Berths</div></div>
      <div class="kpi-card"><div class="kpi-value">${formatArea(data.berth_area_sqm)}</div><div class="kpi-label">Berths Area</div></div>
      <div class="kpi-card"><div class="kpi-value">${formatCompact(data.quay_length_m)}</div><div class="kpi-label">Est. Quay Length (m)</div></div>
    </div>
  `
}
