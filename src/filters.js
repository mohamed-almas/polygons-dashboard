import { supabase } from './supabaseClient.js'

let portsMasterCache = null

// Loads the full port master list once (region/country/port names for the
// cascading dropdowns and lat/lon for client-side bbox fallback). Small
// table (~3800 rows), safe to fetch in full and filter in-memory.
export async function loadPortsMaster() {
  if (portsMasterCache) return portsMasterCache
  const pageSize = 1000
  let allRows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('polygons_ports_master')
      .select('port_id, port, country, region, coastal_region, lat, lon')
      .range(from, from + pageSize - 1)
    if (error) throw error
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  portsMasterCache = allRows
  return allRows
}

export function distinctRegions(portsMaster) {
  return [...new Set(portsMaster.map((p) => p.region).filter(Boolean))].sort()
}

export function distinctCoastalRegions(portsMaster) {
  return [...new Set(portsMaster.map((p) => p.coastal_region).filter(Boolean))].sort()
}

export function countriesInRegion(portsMaster, region) {
  const rows = region ? portsMaster.filter((p) => p.region === region) : portsMaster
  return [...new Set(rows.map((p) => p.country).filter(Boolean))].sort()
}

export function portsInCountry(portsMaster, region, country) {
  let rows = portsMaster
  if (region) rows = rows.filter((p) => p.region === region)
  if (country) rows = rows.filter((p) => p.country === country)
  return rows
    .filter((p) => p.port)
    .sort((a, b) => a.port.localeCompare(b.port))
}

// Bounding box in [minLon, minLat, maxLon, maxLat] form, computed client-side
// from the already-loaded port master rows for the given filter.
export function bboxForRows(rows) {
  if (rows.length === 0) return null
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const r of rows) {
    if (r.lon == null || r.lat == null) continue
    minLon = Math.min(minLon, r.lon)
    minLat = Math.min(minLat, r.lat)
    maxLon = Math.max(maxLon, r.lon)
    maxLat = Math.max(maxLat, r.lat)
  }
  if (!isFinite(minLon)) return null
  return [minLon, minLat, maxLon, maxLat]
}
