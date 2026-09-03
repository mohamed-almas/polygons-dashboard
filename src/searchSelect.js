// Custom dropdown replacing native <select> for the topbar filters -- adds
// a type-to-filter search box, and optionally multi-select (checkboxes,
// stays open across picks) instead of a single value.
//
// createSearchSelect(container, { multi, placeholder }) renders into
// `container` (an empty element already in the DOM) and returns a small
// API mirroring what main.js needs from a <select>: setOptions/getValue(s)/
// setValue(s)/onChange, so the rest of the app doesn't need to know this
// isn't a real <select>.
export function createSearchSelect(container, { multi = false, placeholder = '' } = {}) {
  container.classList.add('search-select')
  container.innerHTML = `
    <button type="button" class="ss-toggle">
      <span class="ss-label"></span>
      <span class="ss-caret">&#9662;</span>
    </button>
    <div class="ss-panel" hidden>
      <input type="text" class="ss-search" placeholder="Search..." autocomplete="off" />
      <div class="ss-options"></div>
    </div>
  `
  const toggle = container.querySelector('.ss-toggle')
  const labelEl = container.querySelector('.ss-label')
  const panel = container.querySelector('.ss-panel')
  const searchInput = container.querySelector('.ss-search')
  const optionsEl = container.querySelector('.ss-options')

  let options = [] // [{value, label}]
  let selected = multi ? new Set() : ''
  const listeners = []

  function currentLabel() {
    if (!multi) {
      const opt = options.find((o) => o.value === selected)
      return opt ? opt.label : placeholder
    }
    if (selected.size === 0) return placeholder
    if (selected.size === 1) {
      const opt = options.find((o) => o.value === [...selected][0])
      return opt ? opt.label : placeholder
    }
    return `${selected.size} selected`
  }

  function renderLabel() {
    labelEl.textContent = currentLabel()
    container.classList.toggle('ss-has-value', multi ? selected.size > 0 : !!selected)
  }

  function renderOptions() {
    const q = searchInput.value.trim().toLowerCase()
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    optionsEl.innerHTML = ''
    for (const opt of filtered) {
      const row = document.createElement('div')
      row.className = 'ss-option'
      if (multi) {
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = selected.has(opt.value)
        row.appendChild(checkbox)
      } else if (opt.value === selected) {
        row.classList.add('ss-option-active')
      }
      const text = document.createElement('span')
      text.textContent = opt.label
      row.appendChild(text)
      row.addEventListener('click', () => {
        if (multi) {
          if (selected.has(opt.value)) selected.delete(opt.value)
          else selected.add(opt.value)
          renderOptions()
          renderLabel()
          fireChange()
        } else {
          selected = opt.value
          renderLabel()
          closePanel()
          fireChange()
        }
      })
      optionsEl.appendChild(row)
    }
    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'ss-empty'
      empty.textContent = 'No matches'
      optionsEl.appendChild(empty)
    }
  }

  function fireChange() {
    for (const cb of listeners) cb()
  }

  function openPanel() {
    panel.hidden = false
    container.classList.add('ss-open')
    searchInput.value = ''
    renderOptions()
    searchInput.focus()
  }

  function closePanel() {
    panel.hidden = true
    container.classList.remove('ss-open')
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) openPanel()
    else closePanel()
  })

  searchInput.addEventListener('input', renderOptions)

  // Use composedPath (captured at dispatch time) instead of
  // container.contains(e.target) -- an option click re-renders the list
  // synchronously, detaching the clicked node from the DOM before this
  // bubbles to document, which would make contains() wrongly report "outside".
  document.addEventListener('click', (e) => {
    if (!e.composedPath().includes(container)) closePanel()
  })

  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel()
  })

  renderLabel()

  return {
    setOptions(opts) {
      options = opts
      if (!multi && selected && !options.some((o) => o.value === selected)) selected = ''
      if (multi) for (const v of [...selected]) if (!options.some((o) => o.value === v)) selected.delete(v)
      renderLabel()
      if (!panel.hidden) renderOptions()
    },
    getValue() {
      return selected
    },
    setValue(v) {
      selected = v || ''
      renderLabel()
    },
    getValues() {
      return [...selected]
    },
    setValues(arr) {
      selected = new Set(arr || [])
      renderLabel()
    },
    onChange(cb) {
      listeners.push(cb)
    },
  }
}
