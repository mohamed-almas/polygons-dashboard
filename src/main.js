import './style.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { initMap } from './map.js'
import { renderKpiCards } from './kpi.js'
import { loadPortsMaster, distinctRegions, countriesInRegion, portsInCountry, bboxForRows } from './filters.js'

const kpiCards = document.getElementById('kpi-cards')
const regionSelect = document.getElementById('region-select')
const countrySelect = document.getElementById('country-select')
const portSelect = document.getElementById('port-select')
const levelToggles = [...document.querySelectorAll('#level-toggles input[type=checkbox]')]

function showLoading() {
  kpiCards.textContent = 'Loading...'
}

function showError(err) {
  console.error(err)
  kpiCards.textContent = `Failed to load dashboard: ${err && err.message ? err.message : err}`
}

function populateSelect(select, options, placeholder) {
  const current = select.value
  select.innerHTML = ''
  const placeholderOpt = document.createElement('option')
  placeholderOpt.value = ''
  placeholderOpt.textContent = placeholder
  select.appendChild(placeholderOpt)
  for (const opt of options) {
    const el = document.createElement('option')
    el.value = opt.value
    el.textContent = opt.label
    select.appendChild(el)
  }
  if (options.some((o) => o.value === current)) select.value = current
}

async function bootstrap() {
  showLoading()

  const [{ setScope, setActiveLevels, fitBounds }, portsMaster] = await Promise.all([
    initMap('map'),
    loadPortsMaster(),
  ])

  function refreshCountryOptions() {
    const region = regionSelect.value
    const countries = countriesInRegion(portsMaster, region)
    populateSelect(countrySelect, countries.map((c) => ({ value: c, label: c })), 'All countries')
  }

  function refreshPortOptions() {
    const region = regionSelect.value
    const country = countrySelect.value
    const ports = portsInCountry(portsMaster, region, country)
    populateSelect(portSelect, ports.map((p) => ({ value: String(p.port_id), label: p.port })), 'All ports')
  }

  populateSelect(regionSelect, distinctRegions(portsMaster).map((r) => ({ value: r, label: r })), 'World')
  refreshCountryOptions()
  refreshPortOptions()

  // Current filter -> {scope, value} for the RPC-backed map/KPI queries.
  function currentScope() {
    if (portSelect.value) return { scope: 'port', value: portSelect.value }
    if (countrySelect.value) return { scope: 'country', value: countrySelect.value }
    if (regionSelect.value) return { scope: 'region', value: regionSelect.value }
    return { scope: 'world', value: null }
  }

  async function applyScope() {
    const { scope, value } = currentScope()
    showLoading()
    await setScope(scope, value)
    await renderKpiCards(scope, value)
  }

  function zoomToCurrentScope() {
    let rows = portsMaster
    if (regionSelect.value) rows = rows.filter((p) => p.region === regionSelect.value)
    if (countrySelect.value) rows = rows.filter((p) => p.country === countrySelect.value)
    if (portSelect.value) rows = rows.filter((p) => String(p.port_id) === portSelect.value)
    fitBounds(regionSelect.value || countrySelect.value || portSelect.value ? bboxForRows(rows) : null)
  }

  regionSelect.addEventListener('change', async () => {
    countrySelect.value = ''
    portSelect.value = ''
    refreshCountryOptions()
    refreshPortOptions()
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  countrySelect.addEventListener('change', async () => {
    portSelect.value = ''
    refreshPortOptions()
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  portSelect.addEventListener('change', async () => {
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  levelToggles.forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const active = levelToggles.filter((t) => t.checked).map((t) => t.value)
      setActiveLevels(active).catch(showError)
    })
  })

  await applyScope()
}

try {
  await bootstrap()
} catch (err) {
  showError(err)
}
