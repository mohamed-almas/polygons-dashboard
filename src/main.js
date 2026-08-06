import './style.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { initMap, CARGO_TYPE_COLOR } from './map.js'
import { renderKpiCards } from './kpi.js'
import { loadPortsMaster, distinctRegions, countriesInRegion, portsInCountry, bboxForRows } from './filters.js'
import { renderPortRelations } from './relations.js'

const CARGO_SWATCH_CLASS = {
  Bulk: 'swatch-cargo-bulk',
  Container: 'swatch-cargo-container',
  Multipurpose: 'swatch-cargo-multipurpose',
  'Ro-Ro': 'swatch-cargo-roro',
  Shipyard: 'swatch-cargo-shipyard',
  Tanker: 'swatch-cargo-tanker',
}
const CARGO_TYPES = Object.keys(CARGO_TYPE_COLOR)

const kpiCards = document.getElementById('kpi-cards')
const regionSelect = document.getElementById('region-select')
const countrySelect = document.getElementById('country-select')
const portSelect = document.getElementById('port-select')
const cargoTypeSelect = document.getElementById('cargo-type-select')
const legendSelect = document.getElementById('legend-select')
const legendItems = document.getElementById('legend-items')
const resetBtn = document.getElementById('reset-btn')

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

  const [
    { setScope, setActiveLevels, setActiveLevelsSync, setExtraPorts, setExtraPortsSync, setCargoType, setCargoTypeSync, setColorMode, setCargoTypeVisibility, fitBounds },
    portsMaster,
  ] = await Promise.all([initMap('map'), loadPortsMaster()])

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

  // Legend/layer-visibility state. In 'level' mode a single Terminals
  // checkbox controls the whole terminal layer; in 'cargo' mode that's
  // replaced by 6 per-cargo-type checkboxes (terminal layer is active if
  // any of them are checked), while port/berth stay simple toggles either way.
  let portChecked = true
  let terminalChecked = true
  let berthChecked = true
  let cargoVisible = new Set(CARGO_TYPES)

  function applyLegendState() {
    const levels = []
    if (portChecked) levels.push('port')
    const terminalActive = legendSelect.value === 'cargo' ? cargoVisible.size > 0 : terminalChecked
    if (terminalActive) levels.push('terminal')
    if (berthChecked) levels.push('berth')
    setActiveLevels(levels).catch(showError)
    setCargoTypeVisibility(legendSelect.value === 'cargo' ? [...cargoVisible] : CARGO_TYPES)
  }

  function addLegendItem(label, swatchClass, checked, onChange) {
    const el = document.createElement('label')
    el.className = 'level-toggle'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = checked
    checkbox.addEventListener('change', () => onChange(checkbox.checked))
    const swatch = document.createElement('span')
    swatch.className = `swatch ${swatchClass}`
    el.append(checkbox, swatch, document.createTextNode(label))
    legendItems.appendChild(el)
  }

  function renderLegend() {
    legendItems.innerHTML = ''
    addLegendItem('Ports', 'swatch-port', portChecked, (checked) => {
      portChecked = checked
      applyLegendState()
    })
    if (legendSelect.value === 'cargo') {
      for (const type of CARGO_TYPES) {
        addLegendItem(type, CARGO_SWATCH_CLASS[type], cargoVisible.has(type), (checked) => {
          if (checked) cargoVisible.add(type)
          else cargoVisible.delete(type)
          applyLegendState()
        })
      }
    } else {
      addLegendItem('Terminals', 'swatch-terminal', terminalChecked, (checked) => {
        terminalChecked = checked
        applyLegendState()
      })
    }
    addLegendItem('Berths', 'swatch-berth', berthChecked, (checked) => {
      berthChecked = checked
      applyLegendState()
    })
  }

  renderLegend()

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

  legendSelect.addEventListener('change', () => {
    setColorMode(legendSelect.value)
    renderLegend()
    applyLegendState()
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
    refreshCountryOptions()
    refreshPortOptions()
    zoomToCurrentScope()

    legendSelect.value = 'level'
    setColorMode('level')
    portChecked = true
    terminalChecked = true
    berthChecked = true
    cargoVisible = new Set(CARGO_TYPES)
    renderLegend()
    setActiveLevelsSync(['port', 'terminal', 'berth'])
    setCargoTypeVisibility(CARGO_TYPES)
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
