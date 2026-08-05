import { supabase } from './supabaseClient.js'

function fmt(n) {
  return Math.round(n).toLocaleString()
}

export async function renderKpiCards(scope, value) {
  const { data, error } = await supabase.rpc('polygons_kpis', { p_scope: scope, p_value: value }).single()
  if (error) throw error

  const container = document.getElementById('kpi-cards')
  container.innerHTML = `
    <div class="kpi-card"><div class="kpi-value">${fmt(data.port_count)}</div><div class="kpi-label">Ports</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(data.terminal_count)}</div><div class="kpi-label">Terminals</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(data.berth_count)}</div><div class="kpi-label">Berths</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(data.given_port_area_sqm)}</div><div class="kpi-label">Given port area (sqm)</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(data.physical_area_sqm)}</div><div class="kpi-label">Physical area (sqm)</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(data.estimated_area_sqm)}</div><div class="kpi-label">Estimated port area (sqm)</div></div>
    <div class="kpi-card"><div class="kpi-value">${fmt(data.quay_length_m)}</div><div class="kpi-label">Quay length (m)</div></div>
  `
}
