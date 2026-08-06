import { supabase } from './supabaseClient.js'

// Ports carry an optional parent_port_code/parent_port on their own polygon
// row (set by the provider for satellite/sub-ports). A port's children are
// simply other ports whose parent_port_code points back at it.
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

  container.innerHTML = '<h2>Related ports</h2>'
  const table = document.createElement('table')
  table.className = 'relations-table'

  function addRow(label, name, code) {
    const tr = document.createElement('tr')
    const td1 = document.createElement('td')
    td1.textContent = label
    const td2 = document.createElement('td')
    td2.textContent = name
    if (onSelectPort) {
      td2.className = 'relations-link'
      td2.addEventListener('click', () => onSelectPort(code))
    }
    const td3 = document.createElement('td')
    if (onToggleRelated) {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.title = 'Show this port\'s polygons on the map too'
      checkbox.addEventListener('change', () => onToggleRelated(code, checkbox.checked))
      td3.appendChild(checkbox)
    }
    tr.append(td1, td2, td3)
    table.appendChild(tr)
  }

  if (parent) addRow('Parent', parent.parent_port, parent.parent_port_code)
  for (const c of uniqueChildren) addRow('Sub-port', c.port, c.port_code)

  container.appendChild(table)
}
