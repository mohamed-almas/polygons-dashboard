import './style.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { initMap } from './map.js'
import { renderKpiCards } from './kpi.js'
import { loadPortsMaster, distinctRegions, countriesInRegion, portsInCountry, bboxForRows } from './filters.js'
import { renderPortRelations } from './relations.js'

const kpiCards = document.getElementById('kpi-cards')
const regionSelect = document.getElementById('region-select')
const countrySelect = document.getElementById('country-select')
const portSelect = document.getElementById('port-select')
const cargoTypeSelect = document.getElementById('cargo-type-select')
const resetBtn = document.getElementById('reset-btn')
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

  const [{ setScope, setActiveLevels, setActiveLevelsSync, setExtraPorts, setExtraPortsSync, setCargoType, setCargoTypeSync, fitBounds }, portsMaster] = await Promise.all([
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

  // Filter changes can overlap (e.g. a slow world-scope fetch still in
  // flight when the user picks a country). Each applyScope call gets a
  // token; if a newer call started before this one finishes, this one
  // drops its render instead of overwriting the UI with stale data.
  let requestToken = 0
  let extraPortIds = new Set()
  let extraPortOverrides = {}

  async function applyScope() {
    const token = ++requestToken
    const { scope, value } = currentScope()
    showLoading()
    extraPortIds = new Set()
    extraPortOverrides = {}
    setExtraPortsSync([], {})
    await setScope(scope, value)
    if (token !== requestToken) return
    await renderKpiCards(scope, value, cargoTypeSelect.value || null)
    if (token !== requestToken) return
    await renderPortRelations(scope === 'port' ? Number(value) : null, selectPortById, toggleRelatedPort)
  }

  // A checked related-port row overlays that port's polygons on the map on
  // top of the current scope, without changing the KPI cards or filters.
  // For a checked sub-port specifically, its own port-polygon tooltip shows
  // the currently browsed (parent) port's name instead of its own.
  function toggleRelatedPort(portId, checked, isSubPorts) {
    if (checked) {
      extraPortIds.add(portId)
      if (isSubPorts && portSelect.value) {
        const parentRow = portsMaster.find((p) => String(p.port_id) === portSelect.value)
        if (parentRow) extraPortOverrides[portId] = parentRow.port
      }
    } else {
      extraPortIds.delete(portId)
      delete extraPortOverrides[portId]
    }
    setExtraPorts([...extraPortIds], extraPortOverrides).catch(showError)
  }

  // Jump to an arbitrary port (e.g. from the parent/sub-port relations
  // table), regardless of the currently selected region/country filters.
  function selectPortById(portId) {
    const row = portsMaster.find((p) => p.port_id === portId)
    if (!row) return
    regionSelect.value = row.region || ''
    refreshCountryOptions()
    countrySelect.value = row.country || ''
    refreshPortOptions()
    portSelect.value = String(portId)
    zoomToCurrentScope()
    applyScope().catch(showError)
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

  cargoTypeSelect.addEventListener('change', async () => {
    const { scope, value } = currentScope()
    await setCargoType(cargoTypeSelect.value).catch(showError)
    await renderKpiCards(scope, value, cargoTypeSelect.value || null).catch(showError)
  })

  resetBtn.addEventListener('click', async () => {
    regionSelect.value = ''
    countrySelect.value = ''
    portSelect.value = ''
    cargoTypeSelect.value = ''
    levelToggles.forEach((t) => { t.checked = true })
    refreshCountryOptions()
    refreshPortOptions()
    zoomToCurrentScope()
    setActiveLevelsSync(levelToggles.map((t) => t.value))
    setCargoTypeSync('')
    await applyScope().catch(showError)
  })

  await applyScope()
}

try {
  await bootstrap()
} catch (err) {
  showError(err)
}
