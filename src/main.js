import './style.css'
import { initMap } from './map.js'

const { setLevel } = await initMap('map')
await setLevel('port')

document.getElementById('level-select').addEventListener('change', (e) => {
  setLevel(e.target.value)
})
