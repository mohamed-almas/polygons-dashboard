import './style.css'
import { initMap } from './map.js'
import { renderKpiCards } from './kpi.js'

const kpiCards = document.getElementById('kpi-cards')

function showLoading() {
  kpiCards.textContent = 'Loading...'
}

function showError(err) {
  console.error(err)
  kpiCards.textContent = `Failed to load dashboard: ${err && err.message ? err.message : err}`
}

async function bootstrap() {
  showLoading()
  const { setLevel } = await initMap('map')
  await setLevel('port')
  await renderKpiCards('global')

  document.getElementById('level-select').addEventListener('change', (e) => {
    setLevel(e.target.value).catch(showError)
  })

  document.getElementById('scope-select').addEventListener('change', (e) => {
    if (e.target.value === 'global') {
      renderKpiCards('global').catch(showError)
    }
    // region/country drill-down group_key selection is a future enhancement;
    // for now, global is the only fully wired scope.
  })
}

try {
  await bootstrap()
} catch (err) {
  showError(err)
}
