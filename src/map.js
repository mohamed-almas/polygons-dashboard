import maplibregl from 'maplibre-gl'
import { supabase } from './supabaseClient.js'
import { formatCompact, cleanName } from './format.js'

const MaplibreMap = maplibregl.Map
const Popup = maplibregl.Popup

const RPC_NAME = {
  port: 'polygons_ports_geojson',
  terminal: 'polygons_terminals_geojson',
  berth: 'polygons_berths_geojson',
}

// Port border switches white/black by UI theme for contrast against the
// basemap (see portLineColor); everything else here is theme-independent.
export const LEVEL_STYLE = {
  port: { fill: '#ffffff', fillOpacity: 0.05, lineWidth: 2.5 },
  terminal: { line: '#2563eb', fill: '#2563eb', fillOpacity: 0.35, lineWidth: 1.5 },
  berth: { line: '#dc2626', fill: '#dc2626', fillOpacity: 0.35, lineWidth: 1.5 },
}

// Terminal colors when coloring by cargo type instead of by level. Port and
// berth colors stay the same in both modes. Tanker is black on the light
// basemap but switches to white on the dark basemap for contrast.
export const CARGO_TYPE_COLOR = {
  Bulk: '#16a34a',
  Container: '#218bc9',
  Multipurpose: '#f97316',
  'Ro-Ro': '#eab308',
  Shipyard: '#9333ea',
  Tanker: '#000000',
}
const CARGO_TYPE_FILL_OPACITY = 0.85
const CARGO_TYPE_DEFAULT_COLOR = '#94a3b8'

function portLineColor(uiTheme) {
  return uiTheme === 'dark' ? '#ffffff' : '#000000'
}

function cargoColor(type, uiTheme) {
  if (type === 'Tanker' && uiTheme === 'dark') return '#ffffff'
  return CARGO_TYPE_COLOR[type]
}

function cargoTypeColorExpression(uiTheme) {
  const expr = ['match', ['get', 'terminal_type']]
  for (const type of Object.keys(CARGO_TYPE_COLOR)) expr.push(type, cargoColor(type, uiTheme))
  expr.push(CARGO_TYPE_DEFAULT_COLOR)
  return expr
}

// Bottom to top: port sits under terminal/berth.
const LEVELS = ['port', 'terminal', 'berth']

// Borders-only basemaps with no graticule/lat-lon lines, one per UI theme.
const BASEMAP_STYLE = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
}

async function fetchLevelGeoJson(level, scope, value, cargoType) {
  // These RPCs return a single aggregated `json` array (not a SETOF row
  // set), so there's no PostgREST row cap to page around -- one call.
  const params = { p_scope: scope, p_value: value }
  if (level === 'terminal' || level === 'berth') params.p_cargo_type = cargoType || null
  const { data, error } = await supabase.rpc(RPC_NAME[level], params)
  if (error) throw error
  const rows = data || []
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      properties: {
        id: row.id,
        area_sqm: row.area_sqm,
        name: row.polygon_name,
        port_name: row.port_name,
        terminal_name: row.terminal_name ?? null,
        terminal_type: row.terminal_type ?? null,
        berth_type: row.berth_type ?? null,
        level,
      },
      geometry: JSON.parse(row.geom_json),
    })),
  }
}

function tooltipContent(props) {
  const container = document.createElement('div')
  const lines = []
  if (props.level === 'port') {
    lines.push(props.port_name)
  } else if (props.level === 'terminal') {
    lines.push(`Port: ${props.port_name}`)
    lines.push(cleanName(props.name))
    lines.push(`Cargo Type: ${props.terminal_type || 'Unknown'}`)
  } else {
    lines.push(`Port: ${props.port_name}`)
    if (props.terminal_name) lines.push(`Terminal: ${cleanName(props.terminal_name)}`)
    lines.push(cleanName(props.name))
    lines.push(`Berth Type: ${props.berth_type || 'Unknown'}`)
    if (props.terminal_name) lines.push(`Cargo Type: ${props.terminal_type || 'Unknown'}`)
  }
  lines.forEach((line, i) => {
    const el = document.createElement(i === 0 ? 'strong' : 'div')
    el.textContent = line
    container.appendChild(el)
  })
  const area = document.createElement('div')
  area.className = 'tooltip-area'
  area.textContent = `Area: ${formatCompact(props.area_sqm)} sqkm`
  container.appendChild(area)
  return container
}

function addLevelLayers(map, level, uiTheme) {
  const style = LEVEL_STYLE[level]
  const lineColor = level === 'port' ? portLineColor(uiTheme) : style.line
  const sourceId = `polygons-${level}-source`
  const fillLayerId = `polygons-${level}-fill`
  const lineLayerId = `polygons-${level}-line`

  map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

  // Every level gets a fill layer (even the near-invisible port wash) so
  // hovering anywhere inside the polygon -- not just on the border -- fires
  // the tooltip.
  map.addLayer({
    id: fillLayerId,
    type: 'fill',
    source: sourceId,
    paint: { 'fill-color': style.fill, 'fill-opacity': style.fillOpacity },
  })

  map.addLayer({
    id: lineLayerId,
    type: 'line',
    source: sourceId,
    paint: { 'line-color': lineColor, 'line-width': style.lineWidth },
  })

  const hoverPopup = new Popup({ closeButton: false, closeOnClick: false })

  const onMove = (e) => {
    if (!e.features || e.features.length === 0) return
    map.getCanvas().style.cursor = 'pointer'
    hoverPopup.setLngLat(e.lngLat).setDOMContent(tooltipContent(e.features[0].properties)).addTo(map)
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
    hoverPopup.remove()
  }

  map.on('mousemove', fillLayerId, onMove)
  map.on('mouseleave', fillLayerId, onLeave)
}

export async function initMap(containerId, initialUiTheme) {
  let uiTheme = initialUiTheme === 'light' ? 'light' : 'dark'

  const map = new MaplibreMap({
    container: containerId,
    style: BASEMAP_STYLE[uiTheme],
    center: [10, 20],
    zoom: 1.5,
  })

  map.addControl(new maplibregl.FullscreenControl())

  await new Promise((resolve) => map.on('load', resolve))

  for (const level of LEVELS) addLevelLayers(map, level, uiTheme)

  const activeLevels = new Set(LEVELS)
  let currentScope = 'world'
  let currentValue = null
  let currentCargoType = null
  let extraPortIds = []
  let extraPortOverrides = {}
  let currentColorMode = 'level'
  let currentCargoVisibility = Object.keys(CARGO_TYPE_COLOR)
  let refreshToken = 0

  async function refresh() {
    const token = ++refreshToken
    await Promise.all(
      LEVELS.map(async (level) => {
        const sourceId = `polygons-${level}-source`
        const visibility = activeLevels.has(level) ? 'visible' : 'none'
        map.setLayoutProperty(`polygons-${level}-line`, 'visibility', visibility)
        map.setLayoutProperty(`polygons-${level}-fill`, 'visibility', visibility)
        if (!activeLevels.has(level)) return

        const [primary, ...extras] = await Promise.all([
          fetchLevelGeoJson(level, currentScope, currentValue, currentCargoType),
          ...extraPortIds.map((id) => fetchLevelGeoJson(level, 'port', String(id), currentCargoType)),
        ])
        // A newer refresh() started while these fetches were in flight --
        // drop this stale result instead of clobbering the current view.
        if (token !== refreshToken) return

        const seen = new Set(primary.features.map((f) => f.properties.id))
        const features = primary.features.slice()
        for (let i = 0; i < extras.length; i++) {
          const overrideName = extraPortOverrides[extraPortIds[i]]
          for (const f of extras[i].features) {
            if (seen.has(f.properties.id)) continue
            seen.add(f.properties.id)
            // A sub-port's own port polygon, when overlaid, shows the
            // currently browsed (parent) port's name on hover instead of
            // its own -- only the port-level polygon, not its terminals
            // or berths.
            if (level === 'port' && overrideName) {
              f.properties.port_name = overrideName
            }
            features.push(f)
          }
        }
        map.getSource(sourceId).setData({ type: 'FeatureCollection', features })
      })
    )
  }

  async function setScope(scope, value) {
    currentScope = scope
    currentValue = value
    await refresh()
  }

  async function setCargoType(cargoType) {
    currentCargoType = cargoType
    await refresh()
  }

  // Same as setCargoType but skips the fetch -- for the reset button, which
  // calls setScope right after anyway.
  function setCargoTypeSync(cargoType) {
    currentCargoType = cargoType
  }

  // Overlay one or more extra ports' polygons on top of the current scope
  // (e.g. a related parent/sub-port checked in the relations table).
  // overrides is an optional {portId: displayName} map, used so a checked
  // sub-port's own port polygon tooltip shows the parent port's name.
  async function setExtraPorts(portIds, overrides) {
    extraPortIds = portIds
    extraPortOverrides = overrides || {}
    await refresh()
  }

  // Same as setExtraPorts but skips the fetch -- for applyScope's own
  // scope-change path, which calls setScope right after anyway.
  function setExtraPortsSync(portIds, overrides) {
    extraPortIds = portIds
    extraPortOverrides = overrides || {}
  }

  async function setActiveLevels(levels) {
    activeLevels.clear()
    for (const l of levels) activeLevels.add(l)
    await refresh()
  }

  // Same as setActiveLevels but skips the data fetch -- for callers (like a
  // reset button) that are about to call setScope right after anyway, so a
  // second full refresh() would just double the network work.
  function setActiveLevelsSync(levels) {
    activeLevels.clear()
    for (const l of levels) activeLevels.add(l)
    for (const level of LEVELS) {
      const visibility = activeLevels.has(level) ? 'visible' : 'none'
      map.setLayoutProperty(`polygons-${level}-line`, 'visibility', visibility)
      map.setLayoutProperty(`polygons-${level}-fill`, 'visibility', visibility)
    }
  }

  // 'level' (default): terminal colored same as the legend (blue). 'cargo':
  // terminal colored per its terminal_type via a match expression. Port and
  // berth layers are unaffected either way.
  function setColorMode(mode) {
    currentColorMode = mode
    if (mode === 'cargo') {
      map.setPaintProperty('polygons-terminal-fill', 'fill-color', cargoTypeColorExpression(uiTheme))
      map.setPaintProperty('polygons-terminal-fill', 'fill-opacity', CARGO_TYPE_FILL_OPACITY)
      map.setPaintProperty('polygons-terminal-line', 'line-color', cargoTypeColorExpression(uiTheme))
    } else {
      map.setPaintProperty('polygons-terminal-fill', 'fill-color', LEVEL_STYLE.terminal.fill)
      map.setPaintProperty('polygons-terminal-fill', 'fill-opacity', LEVEL_STYLE.terminal.fillOpacity)
      map.setPaintProperty('polygons-terminal-line', 'line-color', LEVEL_STYLE.terminal.line)
    }
  }

  // For the Cargo Type legend's per-type checkmarks: hide terminal features
  // whose terminal_type isn't in the given list. All 6 checked (or an empty
  // "no filter" call) clears the filter entirely.
  function setCargoTypeVisibility(types) {
    currentCargoVisibility = types
    const allTypes = Object.keys(CARGO_TYPE_COLOR)
    const filter = types.length >= allTypes.length ? null : ['in', ['get', 'terminal_type'], ['literal', types]]
    map.setFilter('polygons-terminal-fill', filter)
    map.setFilter('polygons-terminal-line', filter)
  }

  // Swaps the basemap (light/dark) and re-tints the port border + Tanker
  // cargo color for contrast. setStyle() wipes all custom sources/layers,
  // so everything gets rebuilt once the new style finishes loading.
  function setUiTheme(theme) {
    if (theme === uiTheme) return
    uiTheme = theme
    map.setStyle(BASEMAP_STYLE[uiTheme])
    map.once('style.load', () => {
      for (const level of LEVELS) addLevelLayers(map, level, uiTheme)
      setActiveLevelsSync([...activeLevels])
      setColorMode(currentColorMode)
      if (currentColorMode === 'cargo') setCargoTypeVisibility(currentCargoVisibility)
      refresh()
    })
  }

  function fitBounds(bbox) {
    if (!bbox) {
      map.flyTo({ center: [10, 20], zoom: 1.5 })
      return
    }
    const [minLon, minLat, maxLon, maxLat] = bbox
    if (minLon === maxLon && minLat === maxLat) {
      map.flyTo({ center: [minLon, minLat], zoom: 10 })
    } else {
      map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 40, maxZoom: 12 })
    }
  }

  return {
    map,
    setScope,
    setActiveLevels,
    setActiveLevelsSync,
    setExtraPorts,
    setExtraPortsSync,
    setCargoType,
    setCargoTypeSync,
    setColorMode,
    setCargoTypeVisibility,
    setUiTheme,
    fitBounds,
  }
}
