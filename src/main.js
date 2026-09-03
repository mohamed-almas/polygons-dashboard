import './style.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { initMap, CARGO_TYPE_COLOR } from './map.js'
import { renderKpiCards } from './kpi.js'
import { loadPortsMaster, distinctRegions, distinctCoastalRegions, countriesInRegion, portsInCountry, bboxForRows } from './filters.js'
import { renderPortRelations } from './relations.js'
import { createSearchSelect } from './searchSelect.js'

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
const regionSelect = createSearchSelect(document.getElementById('region-select'), { placeholder: 'World' })
const countrySelect = createSearchSelect(document.getElementById('country-select'), { placeholder: 'All countries' })
const coastalRegionSelect = createSearchSelect(document.getElementById('coastal-region-select'), { placeholder: 'All coastal regions' })
const portSelect = createSearchSelect(document.getElementById('port-select'), { placeholder: 'All ports' })
const cargoTypeSelect = createSearchSelect(document.getElementById('cargo-type-select'), { multi: true, placeholder: 'All cargo types' })
cargoTypeSelect.setOptions(CARGO_TYPES.map((t) => ({ value: t, label: t })))
const legendSelect = document.getElementById('legend-select')
const legendItems = document.getElementById('legend-items')
const resetBtn = document.getElementById('reset-btn')
const relationsCollapseBtn = document.getElementById('relations-collapse-btn')
const portRelations = document.getElementById('port-relations')
const themeToggle = document.getElementById('theme-toggle')
const themeIcon = document.getElementById('theme-icon')

function showLoading() {
  kpiCards.textContent = 'Loading...'
}

function showError(err) {
  console.error(err)
  kpiCards.textContent = `Failed to load dashboard: ${err && err.message ? err.message : err}`
}

// Single-select option lists get an explicit "clear" row (value '') at the
// front matching the placeholder text, so it's pickable from inside the
// menu too, not just implied by having nothing selected.
function withPlaceholder(placeholder, opts) {
  return [{ value: '', label: placeholder }, ...opts]
}

async function bootstrap() {
  showLoading()

  const [
    { setScope, setActiveLevels, setActiveLevelsSync, setExtraPorts, setExtraPortsSync, setCargoType, setCargoTypeSync, setColorMode, setCargoTypeVisibility, setUiTheme, fitBounds },
    portsMaster,
  ] = await Promise.all([
    initMap('map', document.documentElement.getAttribute('data-theme')),
    loadPortsMaster(),
  ])

  function refreshCountryOptions() {
    const region = regionSelect.getValue()
    const countries = countriesInRegion(portsMaster, region)
    countrySelect.setOptions(withPlaceholder('All countries', countries.map((c) => ({ value: c, label: c }))))
  }

  function refreshPortOptions() {
    const region = regionSelect.getValue()
    const country = countrySelect.getValue()
    const ports = portsInCountry(portsMaster, region, country)
    portSelect.setOptions(withPlaceholder('All ports', ports.map((p) => ({ value: String(p.port_id), label: p.port }))))
  }

  regionSelect.setOptions(withPlaceholder('World', distinctRegions(portsMaster).map((r) => ({ value: r, label: r }))))
  coastalRegionSelect.setOptions(withPlaceholder('All coastal regions', distinctCoastalRegions(portsMaster).map((r) => ({ value: r, label: r }))))
  refreshCountryOptions()
  refreshPortOptions()

  // Current filter -> {scope, value} for the RPC-backed map/KPI queries.
  // Coastal Region is an independent grouping (spans multiple countries),
  // not a nested step inside Region/Country -- most-specific-wins, same as
  // the existing region/country/port chain.
  function currentScope() {
    if (portSelect.getValue()) return { scope: 'port', value: portSelect.getValue() }
    if (countrySelect.getValue()) return { scope: 'country', value: countrySelect.getValue() }
    if (coastalRegionSelect.getValue()) return { scope: 'coastal_region', value: coastalRegionSelect.getValue() }
    if (regionSelect.getValue()) return { scope: 'region', value: regionSelect.getValue() }
    return { scope: 'world', value: null }
  }

  function currentCargoTypes() {
    const values = cargoTypeSelect.getValues()
    return values.length > 0 ? values : null
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
    el.appendChild(checkbox)
    if (swatchClass) {
      const swatch = document.createElement('span')
      swatch.className = `swatch ${swatchClass}`
      el.appendChild(swatch)
    }
    el.appendChild(document.createTextNode(label))
    legendItems.appendChild(el)
  }

  function renderLegend() {
    legendItems.innerHTML = ''
    if (legendSelect.value === 'cargo') {
      // "All" controls every other item in this mode (Ports, the 6 cargo
      // types, and Berths) -- checked when all 8 are currently on.
      const allOn = portChecked && cargoVisible.size === CARGO_TYPES.length && berthChecked
      addLegendItem('All', null, allOn, (checked) => {
        portChecked = checked
        berthChecked = checked
        cargoVisible = checked ? new Set(CARGO_TYPES) : new Set()
        renderLegend()
        applyLegendState()
      })
    }
    addLegendItem('Ports', 'swatch-port', portChecked, (checked) => {
      portChecked = checked
      if (legendSelect.value === 'cargo') renderLegend()
      applyLegendState()
    })
    if (legendSelect.value === 'cargo') {
      for (const type of CARGO_TYPES) {
        addLegendItem(type, CARGO_SWATCH_CLASS[type], cargoVisible.has(type), (checked) => {
          if (checked) cargoVisible.add(type)
          else cargoVisible.delete(type)
          renderLegend()
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
      if (legendSelect.value === 'cargo') renderLegend()
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
    await renderKpiCards(scope, value, currentCargoTypes())
    if (token !== requestToken) return
    await renderPortRelations(scope === 'port' ? Number(value) : null, selectPortById, toggleRelatedPort)
    relationsCollapseBtn.style.display = portRelations.innerHTML ? 'flex' : 'none'
  }

  // A checked related-port row overlays that port's polygons on the map on
  // top of the current scope, without changing the KPI cards or filters.
  // For a checked sub-port specifically, its own port-polygon tooltip shows
  // the currently browsed (parent) port's name instead of its own.
  function toggleRelatedPort(portId, checked, isSubPorts) {
    if (checked) {
      extraPortIds.add(portId)
      if (isSubPorts && portSelect.getValue()) {
        const parentRow = portsMaster.find((p) => String(p.port_id) === portSelect.getValue())
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
    regionSelect.setValue(row.region || '')
    coastalRegionSelect.setValue('')
    refreshCountryOptions()
    countrySelect.setValue(row.country || '')
    refreshPortOptions()
    portSelect.setValue(String(portId))
    zoomToCurrentScope()
    applyScope().catch(showError)
  }

  function zoomToCurrentScope() {
    let rows = portsMaster
    if (regionSelect.getValue()) rows = rows.filter((p) => p.region === regionSelect.getValue())
    if (coastalRegionSelect.getValue()) rows = rows.filter((p) => p.coastal_region === coastalRegionSelect.getValue())
    if (countrySelect.getValue()) rows = rows.filter((p) => p.country === countrySelect.getValue())
    if (portSelect.getValue()) rows = rows.filter((p) => String(p.port_id) === portSelect.getValue())
    const anyFilter = regionSelect.getValue() || coastalRegionSelect.getValue() || countrySelect.getValue() || portSelect.getValue()
    fitBounds(anyFilter ? bboxForRows(rows) : null)
  }

  regionSelect.onChange(async () => {
    countrySelect.setValue('')
    portSelect.setValue('')
    refreshCountryOptions()
    refreshPortOptions()
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  countrySelect.onChange(async () => {
    portSelect.setValue('')
    refreshPortOptions()
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  coastalRegionSelect.onChange(async () => {
    portSelect.setValue('')
    refreshPortOptions()
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  portSelect.onChange(async () => {
    zoomToCurrentScope()
    await applyScope().catch(showError)
  })

  legendSelect.addEventListener('change', () => {
    setColorMode(legendSelect.value)
    renderLegend()
    applyLegendState()
  })

  cargoTypeSelect.onChange(async () => {
    const { scope, value } = currentScope()
    const types = currentCargoTypes()
    await setCargoType(types).catch(showError)
    await renderKpiCards(scope, value, types).catch(showError)
  })

  resetBtn.addEventListener('click', async () => {
    regionSelect.setValue('')
    countrySelect.setValue('')
    coastalRegionSelect.setValue('')
    portSelect.setValue('')
    cargoTypeSelect.setValues([])
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
    setCargoTypeSync(null)

    await applyScope().catch(showError)
  })

  relationsCollapseBtn.addEventListener('click', () => {
    const collapsed = portRelations.classList.toggle('collapsed')
    relationsCollapseBtn.textContent = collapsed ? '◂' : '▸'
    relationsCollapseBtn.title = collapsed ? 'Expand sub-ports panel' : 'Collapse sub-ports panel'
  })

  themeToggle.addEventListener('click', () => {
    const root = document.documentElement
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    root.setAttribute('data-theme', next)
    themeIcon.textContent = next === 'light' ? '☀' : '☾'
    setUiTheme(next)
  })

  await applyScope()
}

try {
  await bootstrap()
} catch (err) {
  showError(err)
}
