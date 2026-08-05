import maplibregl from 'maplibre-gl'
import { supabase } from './supabaseClient.js'

const MaplibreMap = maplibregl.Map
const Popup = maplibregl.Popup

const RPC_NAME = {
  port: 'polygons_ports_geojson',
  terminal: 'polygons_terminals_geojson',
  berth: 'polygons_berths_geojson',
}

// Port: outline only, no fill. Terminal/Berth: filled + outlined.
export const LEVEL_COLOR = {
  port: '#2563eb',
  terminal: '#d97706',
  berth: '#dc2626',
}

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
      properties: { id: row.id, area_sqm: row.area_sqm, name: row.polygon_name, level },
      geometry: JSON.parse(row.geom_json),
    })),
  }
}

function addLevelLayers(map, level) {
  const sourceId = `polygons-${level}-source`
  const fillLayerId = `polygons-${level}-fill`
  const lineLayerId = `polygons-${level}-line`

  map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

  if (level !== 'port') {
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: { 'fill-color': LEVEL_COLOR[level], 'fill-opacity': 0.45 },
    })
  }

  map.addLayer({
    id: lineLayerId,
    type: 'line',
    source: sourceId,
    paint: { 'line-color': LEVEL_COLOR[level], 'line-width': level === 'port' ? 1.5 : 1 },
  })

  const hoverPopup = new Popup({ closeButton: false, closeOnClick: false })

  const onMove = (e) => {
    if (!e.features || e.features.length === 0) return
    map.getCanvas().style.cursor = 'pointer'
    const props = e.features[0].properties
    const areaLabel = `${Math.round(Number(props.area_sqm)).toLocaleString()} sqm`
    const container = document.createElement('div')
    const strong = document.createElement('strong')
    strong.textContent = props.name
    container.appendChild(strong)
    container.appendChild(document.createElement('br'))
    container.appendChild(document.createTextNode(areaLabel))
    hoverPopup.setLngLat(e.lngLat).setDOMContent(container).addTo(map)
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
    hoverPopup.remove()
  }

  if (level !== 'port') map.on('mousemove', fillLayerId, onMove)
  map.on('mousemove', lineLayerId, onMove)
  map.on('mouseleave', lineLayerId, onLeave)
  if (level !== 'port') map.on('mouseleave', fillLayerId, onLeave)
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

  async function refresh() {
    await Promise.all(
      LEVELS.map(async (level) => {
        const sourceId = `polygons-${level}-source`
        const visibility = activeLevels.has(level) ? 'visible' : 'none'
        map.setLayoutProperty(`polygons-${level}-line`, 'visibility', visibility)
        if (level !== 'port') map.setLayoutProperty(`polygons-${level}-fill`, 'visibility', visibility)
        if (!activeLevels.has(level)) return
        const geojson = await fetchLevelGeoJson(level, currentScope, currentValue)
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

  await refresh()

  return { map, setScope, setActiveLevels, fitBounds }
}
