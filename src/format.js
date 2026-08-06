// Compact number formatting: 1 decimal, K/Mn/Bn suffixes.
export function formatCompact(n) {
  const num = Number(n)
  if (!isFinite(num)) return '0.0'
  const abs = Math.abs(num)
  if (abs >= 1e9) return (num / 1e9).toFixed(1) + 'Bn'
  if (abs >= 1e6) return (num / 1e6).toFixed(1) + 'Mn'
  if (abs >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toFixed(1)
}

// Area cards are sourced in sqkm; below 1.0 sqkm that rounds to "0.0", so
// switch to sqm (1 sqkm = 1e6 sqm) for small scopes.
export function formatArea(sqkm) {
  const num = Number(sqkm)
  if (isFinite(num) && Math.abs(num) < 1) {
    return `${formatCompact(num * 1e6)} sqm`
  }
  return `${formatCompact(num)} sqkm`
}

// Polygon names in the source data are suffixed " Polygon" (e.g. "Berth 2
// Polygon") -- strip it for display.
export function cleanName(name) {
  if (!name) return name
  return name.replace(/\s+Polygon$/i, '')
}
