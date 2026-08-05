import { Map as MaplibreMap, Popup } from 'maplibre-gl'
import { supabase } from './supabaseClient.js'

const RPC_NAME = {
  port: 'polygons_ports_geojson',
  terminal: 'polygons_terminals_geojson',
  berth: 'polygons_berths_geojson',
}

const LEVEL_COLOR = {
  port: '#1f77b4',
  terminal: '#ff7f0e',
  berth: '#d62728',
}

export async function initMap(containerId) {
  const map = new MaplibreMap({
    container: containerId,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [20, 20],
    zoom: 2,
  })

  await new Promise((resolve) => map.on('load', resolve))

  let currentLevel = 'port'

  async function fetchLevelGeoJson(level) {
    const { data, error } = await supabase.rpc(RPC_NAME[level])
    if (error) throw error
    return {
      type: 'FeatureCollection',
      features: data.map((row) => ({
        type: 'Feature',
        properties: { id: row.id, area_sqm: row.area_sqm, name: row.polygon_name },
        geometry: JSON.parse(row.geom_json),
      })),
    }
  }

  async function setLevel(level) {
    currentLevel = level
    const geojson = await fetchLevelGeoJson(level)
    const sourceId = 'polygons-source'
    const layerId = 'polygons-layer'
    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(geojson)
      map.setPaintProperty(layerId, 'fill-color', LEVEL_COLOR[level])
      map.setPaintProperty(`${layerId}-outline`, 'line-color', LEVEL_COLOR[level])
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojson })
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': LEVEL_COLOR[level], 'fill-opacity': 0.5 },
      })
      map.addLayer({
        id: `${layerId}-outline`,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': LEVEL_COLOR[level], 'line-width': 1 },
      })
      map.on('click', layerId, (e) => {
        const props = e.features[0].properties
        new Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${props.name}</strong><br/>Area: ${Number(props.area_sqm).toLocaleString()} sqm`)
          .addTo(map)
      })
    }
  }

  return { map, setLevel, get currentLevel() { return currentLevel } }
}
