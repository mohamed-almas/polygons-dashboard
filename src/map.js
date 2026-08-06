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

export const LEVEL_STYLE = {
  port: { line: '#000000', fill: '#ffffff', fillOpacity: 0.05, lineWidth: 2.5 },
  terminal: { line: '#2563eb', fill: '#2563eb', fillOpacity: 0.35, lineWidth: 1.5 },
  berth: { line: '#dc2626', fill: '#dc2626', fillOpacity: 0.35, lineWidth: 1.5 },
}

// Bottom to top: port sits under terminal/berth.
const LEVELS = ['port', 'terminal', 'berth']

// Light, borders-only basemap with no graticule/lat-lon lines.
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

async function fetchLevelGeoJson(level, scope, value) {
  const pageSize = 1000
  let allRows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .rpc(RPC_NAME[level], { p_scope: scope, p_value: value })
      .range(from, from + pageSize - 1)
    if (error) throw error
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return {
    type: 'FeatureCollection',
    features: allRows.map((row) => ({
      type: 'Feature',
      properties: {
        id: row.id,
        area_sqm: row.area_sqm,
        name: row.polygon_name,
        port_name: row.port_name,
        terminal_name: row.terminal_name ?? null,
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
  } else {
    lines.push(`Port: ${props.port_name}`)
    if (props.terminal_name) lines.push(`Terminal: ${cleanName(props.terminal_name)}`)
    lines.push(cleanName(props.name))
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

function addLevelLayers(map, level) {
  const style = LEVEL_STYLE[level]
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
    paint: { 'line-color': style.line, 'line-width': style.lineWidth },
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

export async function initMap(containerId) {
  const map = new MaplibreMap({
    container: containerId,
    style: BASEMAP_STYLE,
    center: [10, 20],
    zoom: 1.5,
  })

  await new Promise((resolve) => map.on('load', resolve))

  for (const level of LEVELS) addLevelLayers(map, level)

  const activeLevels = new Set(LEVELS)
  let currentScope = 'world'
  let currentValue = null
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
        const geojson = await fetchLevelGeoJson(level, currentScope, currentValue)
        // A newer refresh() started while this fetch was in flight -- drop
        // this stale result instead of clobbering the current view.
        if (token !== refreshToken) return
        map.getSource(sourceId).setData(geojson)
      })
    )
  }

  async function setScope(scope, value) {
    currentScope = scope
    currentValue = value
    await refresh()
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

  return { map, setScope, setActiveLevels, setActiveLevelsSync, fitBounds }
}
