import './style.css'
import { initMap } from './map.js'
import { renderKpiCards } from './kpi.js'

const { setLevel } = await initMap('map')
await setLevel('port')
await renderKpiCards('global')

document.getElementById('level-select').addEventListener('change', (e) => {
  setLevel(e.target.value)
})

document.getElementById('scope-select').addEventListener('change', (e) => {
  if (e.target.value === 'global') renderKpiCards('global')
  // region/country drill-down group_key selection is a future enhancement;
  // for now, global is the only fully wired scope.
})
