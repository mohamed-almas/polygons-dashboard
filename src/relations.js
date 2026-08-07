import { supabase } from './supabaseClient.js'
import { formatCompact, formatArea, formatCount } from './format.js'

// Ports carry an optional parent_port_code/parent_port on their own polygon
// row (set by the provider for satellite/sub-ports). A port's children are
// simply other ports whose parent_port_code points back at it. If both
// exist (rare) children take priority -- "Sub-Ports" is the more useful view.
export async function renderPortRelations(portId, onSelectPort, onToggleRelated) {
  const container = document.getElementById('port-relations')
  if (!portId) {
    container.innerHTML = ''
    return
  }

  const [{ data: own, error: ownErr }, { data: children, error: childErr }] = await Promise.all([
    supabase.from('polygons_ports').select('parent_port_code, parent_port').eq('port_code', portId).limit(1),
    supabase.from('polygons_ports').select('port_code, port').eq('parent_port_code', portId),
  ])
  if (ownErr) throw ownErr
  if (childErr) throw childErr

  const parent = own && own[0] && own[0].parent_port_code ? own[0] : null
  const uniqueChildren = [...new Map(children.map((c) => [c.port_code, c])).values()]

  if (!parent && uniqueChildren.length === 0) {
    container.innerHTML = ''
    return
  }

  const isSubPorts = uniqueChildren.length > 0
  const rows = isSubPorts ? uniqueChildren : [{ port_code: parent.parent_port_code, port: parent.parent_port }]

  const stats = await Promise.all(
    rows.map((r) => supabase.rpc('polygons_kpis', { p_scope: 'port', p_value: String(r.port_code) }).single())
  )

  container.innerHTML = ''

  const body = document.createElement('div')
  body.className = 'relations-body'

  const h2 = document.createElement('h2')
  h2.textContent = isSubPorts ? 'Sub-Ports' : 'Parent'
  body.appendChild(h2)

  const table = document.createElement('table')
  table.className = 'relations-table'
  const thead = document.createElement('tr')
  for (const label of ['', 'Port Name', 'Terminals', 'Berths', 'Wharf Area', 'Port Limits / Harbor Area', 'Est. Quay Length (m)']) {
    const th = document.createElement('th')
    th.textContent = label
    thead.appendChild(th)
  }
  table.appendChild(thead)

  rows.forEach((r, i) => {
    const { data } = stats[i]
    const tr = document.createElement('tr')

    const tdCheck = document.createElement('td')
    if (onToggleRelated) {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.title = 'Show this port\'s polygons on the map too'
      checkbox.addEventListener('change', () => onToggleRelated(r.port_code, checkbox.checked, isSubPorts))
      tdCheck.appendChild(checkbox)
    }

    const tdName = document.createElement('td')
    tdName.textContent = r.port
    if (onSelectPort) {
      tdName.className = 'relations-link'
      tdName.addEventListener('click', () => onSelectPort(r.port_code))
    }

    const tdTerminals = document.createElement('td')
    tdTerminals.textContent = data ? formatCount(data.terminal_count) : '-'
    const tdBerths = document.createElement('td')
    tdBerths.textContent = data ? formatCount(data.berth_count) : '-'
    const tdPhysical = document.createElement('td')
    tdPhysical.textContent = data ? formatArea(data.physical_area_sqm) : '-'
    const tdHarbor = document.createElement('td')
    tdHarbor.textContent = data ? formatArea(data.estimated_area_sqm) : '-'
    const tdQuay = document.createElement('td')
    tdQuay.textContent = data ? formatCompact(data.quay_length_m) : '-'

    tr.append(tdCheck, tdName, tdTerminals, tdBerths, tdPhysical, tdHarbor, tdQuay)
    table.appendChild(tr)
  })

  body.appendChild(table)
  container.appendChild(body)

  if (isSubPorts) {
    const kpi = document.createElement('div')
    kpi.className = 'relations-kpi'
    kpi.innerHTML = `<div class="kpi-value">${formatCount(uniqueChildren.length)}</div><div class="kpi-label">Sub-Ports</div>`
    container.appendChild(kpi)
  }

  const note = document.createElement('p')
  note.className = 'relations-note'
  note.textContent = 'The port polygon for sub-ports is that of the parent port.'
  container.appendChild(note)
}
