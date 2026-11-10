// Egg popup: shown while the player stands at an egg pedestal (the zone trigger's prompt is
// { egg: id }). Title, the 3 x 2 pets with their chances, the cost, a red X, and the
// E Open / R x3 Open / Q Auto buttons (keys on desktop, taps on touch). Not modal: the
// player can still walk away, which hides it (and stops Auto).
//   const eggs = createEggPopup(root, { toast })
//   eggs.update(dt, eggId | null, blocked)   // every frame; blocked = a panel/wheel/hatch is up
import { EGGS, HATCH, PETS } from '../config.js'
import { canHatch, fmt, hatch } from '../game/state.js'
import { ICONS } from './icons.js'
import { btn, h, petTile } from './panels.js'

export function createEggPopup(root, ctx) {
  const el = h('div', 'hud-egg')
  el.hidden = true
  const card = h('div', 'hud-egg-card')
  const title = h('div', 'hud-egg-title hud-ol')
  const grid = h('div', 'hud-egg-grid')
  const cost = h('div', 'hud-egg-cost', `<span class="hud-egg-cost-i">${ICONS.trophy}</span><span class="hud-egg-cost-n hud-ol"></span>`)
  const costN = cost.querySelector('.hud-egg-cost-n')
  const close = btn(
    'hud-egg-x',
    `<svg viewBox="0 0 40 40"><path d="M11 11l18 18M29 11L11 29" stroke="#1d1238" stroke-width="11" stroke-linecap="round"/><path d="M11 11l18 18M29 11L11 29" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/></svg>`,
    () => dismiss(),
  )
  close.setAttribute('aria-label', 'Close')
  card.append(title, grid, cost, close)
  const keys = h('div', 'hud-egg-keys')
  const key = (k, label, cls, fn) => {
    const b = btn(`hud-egg-key ${cls}`, `<span class="hud-egg-key-k hud-ol">${k}</span><span class="hud-egg-key-l hud-ol">${label}</span>`, fn)
    b.setAttribute('aria-label', label)
    return b
  }
  const autoBtn = key('Q', 'Auto', 'is-pink', () => setAuto(!auto))
  keys.append(
    key('E', 'Open', 'is-blue', () => open(1)),
    key('R', 'x3 Open', 'is-orange', () => open(3)),
    autoBtn,
  )
  el.append(card, keys)
  root.appendChild(el)

  let eggId = null // egg the player stands at
  let shown = null // egg currently drawn
  let dismissed = null // egg closed with X (until the player walks away)
  let blocked = false
  let auto = false
  let autoWait = 0

  function build(egg) {
    shown = egg.id
    title.textContent = egg.name
    grid.textContent = ''
    for (const [id, chance] of egg.pets) grid.appendChild(petTile(PETS[id], { foot: `${chance}%` }))
    costN.textContent = fmt(egg.cost)
  }
  function open(n) {
    if (!eggId) return
    const got = hatch(eggId, n)
    if (!got.length) setAuto(false)
  }
  function setAuto(v) {
    auto = !!v && !!eggId
    autoWait = 0
    autoBtn.classList.toggle('is-on', auto)
    if (auto && !canHatch(eggId)) {
      open(1) // shows why (wins / storage) and turns Auto back off
    }
  }
  function dismiss() {
    dismissed = eggId
    setAuto(false)
    el.hidden = true
  }

  // Keys while the popup is up (capture: R must not also respawn).
  window.addEventListener(
    'keydown',
    (e) => {
      if (el.hidden || e.repeat) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return
      const act = { KeyE: () => open(1), KeyR: () => open(3), KeyQ: () => setAuto(!auto) }[e.code]
      if (!act) return
      e.preventDefault()
      e.stopImmediatePropagation()
      act()
    },
    true,
  )

  return {
    update(dt, id, isBlocked) {
      blocked = isBlocked
      if (id !== eggId) {
        eggId = id
        if (dismissed !== id) dismissed = null
        if (!id) setAuto(false)
      }
      const egg = eggId && EGGS.find((e) => e.id === eggId)
      const visible = !!egg && dismissed !== eggId && !blocked
      if (visible && shown !== egg.id) build(egg)
      if (el.hidden === visible) el.hidden = !visible
      if (visible) cost.classList.toggle('is-poor', !canHatch(eggId))
      // Auto: hatch again once the reveal is gone (blocked covers the hatch overlay).
      if (auto && egg && !blocked) {
        autoWait += dt
        if (autoWait >= HATCH.autoDelay) {
          autoWait = 0
          open(1)
        }
      } else autoWait = 0
    },
    isOpen: () => !el.hidden,
    el,
  }
}

