// The game HUD (DOM overlay above the canvas and the touch controls).
//   const hud = createHud()
//   hud.update(dt, { boulder: 'SLOW'|'MEDIUM'|'FAST', prompt: null | { text, action } })  // every frame
//   hud.toast(text, kind) / hud.showHatch({ egg, pet, def }) / hud.levelUp({ level, wins })
//   hud.isOpen()  -> true while a panel (or the hatch reveal) is up: the game ignores input then
// It only reads `state` and calls the actions in game/state.js; it also listens to
// state's 'toast', 'hatch' and 'levelup' events itself. The top-left Boxity toolbar
// area (min(340px, 45vw) x 90px) is kept empty.
import './hud.css'
import { ECONOMY } from '../config.js'
import {
  boostActive,
  boostLeft,
  canRebirth,
  dailyReadyIn,
  fmt,
  multiplier,
  on,
  premium,
  setCustomSpeed,
  state,
  xpNeeded,
  rideMax,
} from '../game/state.js'
import { ICONS, calendarIcon, eggIcon, esc, petIcon } from './icons.js'
import { btn, clock, createPanels, h, multText, rarityColor, setText } from './panels.js'
import { createEggPopup } from './eggs.js'
import { createSpinWheel } from './spinwheel.js'
import { nextGoal } from '../lobby/lane.js'

const BOULDER = {
  SLOW: { cls: 'is-slow', face: '\u{1F642}' },
  MEDIUM: { cls: 'is-medium', face: '\u{1F62C}' },
  FAST: { cls: 'is-fast', face: '\u{1F631}' },
}

export function createHud() {
  const root = h('div', 'hud-root')
  root.setAttribute('aria-live', 'off')

  let hatchShowing = false
  let toastsHeld = false
  const heldToasts = []

  const overlayCtx = {
    toast: (t, k) => toast(t, k),
    holdToasts(onOff) {
      toastsHeld = onOff
      if (!onOff) heldToasts.splice(0).forEach(([t, k]) => toast(t, k))
    },
    onChange() {
      root.classList.toggle('has-panel', panels.isOpen())
      root.classList.toggle('has-wheel', wheel?.isOpen() ?? false)
    },
  }
  const panels = createPanels(root, overlayCtx)
  let wheel = null
  const open = (name) => () => {
    wheel?.close()
    panels.toggle(name)
  }
  const openWheel = () => {
    panels.close()
    wheel.toggle()
  }

  // --- Square icon buttons -------------------------------------------------------
  function sq(name, label, colors, onTap, iconHtml) {
    const b = btn('hud-sq', `<span class="hud-face hud-3d" style="--c1:${colors[0]};--c2:${colors[1]}">${iconHtml || ICONS[name]}</span><span class="hud-sq-label hud-ol">${label}</span><span class="hud-dot" hidden></span>`, onTap)
    b.setAttribute('aria-label', label)
    return b
  }

  // --- Left column: wins, gems, menu grid -------------------------------------------
  const left = h('div', 'hud-left')
  const cur = h('div', 'hud-currency')
  const winsEl = h('div', 'hud-wins', `<span class="hud-wins-i">${ICONS.trophy}</span><span class="hud-wins-n hud-ol">0</span>`)
  const winsN = winsEl.querySelector('.hud-wins-n')
  const gemsEl = btn('hud-gems', `<span class="hud-gems-i">${ICONS.gem}</span><span class="hud-gems-n hud-ol">0</span><span class="hud-gems-plus">${ICONS.plus}</span>`, open('gems'))
  gemsEl.setAttribute('aria-label', 'Gems')
  const gemsN = gemsEl.querySelector('.hud-gems-n')
  cur.append(winsEl)
  const grid = h('div', 'hud-sqgrid')
  const rebirthBtn = sq('rebirth', 'Rebirth', ['#ff8ab4', '#e8265e'], open('rebirth'))
  grid.append(
    sq('shop', 'Shop', ['#ffcf4a', '#ff8a00'], open('shop')),
    rebirthBtn,
    sq('trails', 'Trails', ['#d68bff', '#8a2be2'], open('trails')),
    sq('pets', 'Pets', ['#7fd6ff', '#1f7bff'], open('pets')),
    sq('worlds', 'Worlds', ['#8ef06a', '#22a33a'], open('worlds')),
  )
  left.append(cur, grid)

  // --- Right column: custom speed, boosts, inventory/pranks ---------------------------
  const right = h('div', 'hud-right')
  const rmain = h('div', 'hud-right-main')
  const csCap = h('div', 'hud-cs-cap hud-ol', 'Custom Speed')
  const csBtn = btn('hud-wide hud-cs', `<span class="hud-face hud-3d hud-c-sky"><span class="hud-wide-t hud-ol">MAX</span></span><span class="hud-cs-pencil">${ICONS.pencil}</span>`, () => {})
  csBtn.setAttribute('aria-label', 'Custom speed')
  const csVal = csBtn.querySelector('.hud-wide-t')
  const csMax = h('div', 'hud-cs-max hud-ol', `MAX: ${rideMax()}`)
  // The next hill goal: the MAX that reaches the next cave (or the summit).
  const csNext = h('div', 'hud-cs-next hud-ol', '')
  const nextText = () => {
    const g = nextGoal(rideMax())
    return g ? `NEXT: ${g.max} (${g.name})` : 'SUMMIT IN REACH!'
  }
  const priceBadge = (n) => `<span class="hud-price"><span class="hud-price-i">${ICONS.gem}</span><span class="hud-ol">${n}</span></span>`
  const boostBtn = (kind, label, face, price) => {
    const b = btn(`hud-wide hud-boost`, `<span class="hud-face hud-3d ${face} hud-shine hud-breathe"><span class="hud-wide-t hud-ol">${label}</span></span>${priceBadge(price)}<span class="hud-on hud-ol" hidden>ON</span>`, () => premium({ boost: kind }))
    b.setAttribute('aria-label', label)
    return b
  }
  const speedBtn = boostBtn('speed', '2x Speed', 'hud-c-rainbow', 3)
  const winsBtn = boostBtn('wins', '2x Wins', 'hud-c-goldbtn', 199)
  const csWrap = h('div', 'hud-cs-wrap')
  const csIn = h('input', 'hud-cs-input hud-ol')
  Object.assign(csIn, { type: 'text', inputMode: 'numeric', maxLength: 6, hidden: true })
  csIn.setAttribute('aria-label', 'Type custom speed')
  let csEditing = false
  const csClose = (commit) => {
    if (!csEditing) return
    csEditing = false
    if (commit) {
      const v = parseInt(csIn.value.replace(/\D/g, ''), 10)
      if (Number.isFinite(v)) setCustomSpeed(Math.min(v, rideMax()))
    }
    csIn.hidden = true
    csIn.blur()
    refreshStats()
  }
  csBtn.addEventListener('click', () => {
    csEditing = true
    csIn.value = String(Math.min(state.customSpeed, rideMax()))
    csIn.placeholder = `10-${rideMax()}`
    csIn.hidden = false
    csIn.focus()
    csIn.select()
  })
  csIn.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') csClose(true)
    else if (e.key === 'Escape') csClose(false)
  })
  csIn.addEventListener('keyup', (e) => e.stopPropagation())
  csIn.addEventListener('blur', () => csClose(true))
  csWrap.append(csBtn, csIn)
  rmain.append(csCap, csWrap, csMax, csNext)
  const rsq = h('div', 'hud-right-sq')
  rsq.append(sq('inventory', 'Inventory', ['#ff9a6b', '#e8442a'], open('inventory')))
  right.append(rmain, rsq)

  // --- Top right: boulder status + stop boulders, daily, spin ---------------------------
  const top = h('div', 'hud-top')
  const bStatus = h('div', 'hud-bstatus', `<span class="hud-bstatus-w hud-ol">SLOW</span><span class="hud-bstatus-f">${BOULDER.SLOW.face}</span>`)
  const bWord = bStatus.querySelector('.hud-bstatus-w')
  const bFace = bStatus.querySelector('.hud-bstatus-f')
  const boulderBtn = btn('hud-boulder', `<span class="hud-boulder-i">${ICONS.boulder}</span>${priceBadge(19)}<span class="hud-boulder-l hud-ol">STOP<br>BOULDERS!</span>`, () => premium({ stopBoulders: 60, message: 'Boulders stopped for 60s!' }))
  boulderBtn.setAttribute('aria-label', 'Stop boulders')
  let calDay = new Date().getDate()
  const dailyBtn = btn('hud-mini', `<span class="hud-mini-i hud-cal">${calendarIcon(calDay)}</span><span class="hud-mini-l hud-ol">Daily</span><span class="hud-dot" hidden></span>`, open('daily'))
  dailyBtn.setAttribute('aria-label', 'Daily rewards')
  const spinBtn = btn('hud-mini', `<span class="hud-mini-i hud-spinicon">${ICONS.spin}</span><span class="hud-mini-l hud-ol">Spin!</span><span class="hud-dot" hidden></span>`, openWheel)
  spinBtn.setAttribute('aria-label', 'Spin the wheel')
  top.append(dailyBtn, spinBtn) // the boulder speed rides on each boulder (lane.js)

  // --- Toasts, level-up banner ------------------------------------------------------------
  const toasts = h('div', 'hud-toasts')
  const lvl = h('div', 'hud-levelup', `<div class="hud-lu-t hud-ol">LEVEL UP!</div><div class="hud-lu-s hud-ol"></div>`)
  const lvlSub = lvl.querySelector('.hud-lu-s')

  // --- Bottom stack: prompt, speed row, level bar, grant buttons ---------------------------
  const bottom = h('div', 'hud-bottom')
  const promptBtn = btn('hud-prompt', `<span class="hud-key">E</span><span class="hud-prompt-t hud-ol"></span>`, () => curPrompt?.action?.())
  promptBtn.hidden = true
  const promptT = promptBtn.querySelector('.hud-prompt-t')
  const stats = h('div', 'hud-stats')
  const multEl = h('div', 'hud-mult hud-ol', 'x1 Multiplier')
  const speedEl = h('div', 'hud-speed hud-ol', 'Speed: 0')
  const x2El = h('div', 'hud-x2 hud-ol', 'x2 Speed')
  x2El.style.visibility = 'hidden'
  stats.append(multEl, speedEl, x2El)
  const bar = h('div', 'hud-level', `<div class="hud-level-fill"></div><span class="hud-level-l hud-ol">Level 1</span><span class="hud-level-r hud-ol">0/0</span>`)
  const barFill = bar.querySelector('.hud-level-fill')
  const barL = bar.querySelector('.hud-level-l')
  const barR = bar.querySelector('.hud-level-r')
  const grants = h('div', 'hud-grants')
  const gColors = ['hud-c-blue', 'hud-c-purple', 'hud-c-orange']
  ECONOMY.devGrants.forEach((amt, k) => {
    const label = `+${fmt(amt).toUpperCase()}${k === ECONOMY.devGrants.length - 1 ? ' Speed' : ''}`
    grants.appendChild(btn('hud-grant', `<span class="hud-face hud-3d ${gColors[k % 3]} hud-shine"><span class="hud-ol">${label}</span></span>`, () => premium({ speed: amt })))
  })
  const plusBtn = btn('hud-grant hud-grant-plus', `<span class="hud-face hud-3d hud-c-green">${ICONS.plus}</span>`, open('gems'))
  plusBtn.setAttribute('aria-label', 'Gem shop')
  grants.appendChild(plusBtn)
  bottom.append(promptBtn, stats, bar)

  // --- Hatch reveal overlay ------------------------------------------------------------------
  const hatchEl = h('div', 'hud-hatch')
  hatchEl.hidden = true
  hatchEl.innerHTML = `
    <div class="hud-hatch-rays"></div>
    <div class="hud-hatch-stage">
      <div class="hud-hatch-egg"></div>
      <div class="hud-hatch-flash"></div>
      <div class="hud-hatch-pet"></div>
    </div>
    <div class="hud-hatch-info">
      <div class="hud-hatch-name hud-ol"></div>
      <div class="hud-hatch-rar hud-ol"></div>
      <div class="hud-hatch-boost hud-ol"></div>
    </div>
    <div class="hud-hatch-hint hud-ol">Tap to continue</div>`
  const hEgg = hatchEl.querySelector('.hud-hatch-egg')
  const hPet = hatchEl.querySelector('.hud-hatch-pet')
  const hName = hatchEl.querySelector('.hud-hatch-name')
  const hRar = hatchEl.querySelector('.hud-hatch-rar')
  const hBoost = hatchEl.querySelector('.hud-hatch-boost')
  root.append(left, right, top, toasts, bottom, lvl)
  // createPanels appended the modal first; move it above the HUD (the hatch goes above it)
  root.appendChild(root.querySelector('.hud-modal'))
  const eggPop = createEggPopup(root, overlayCtx) // above the HUD, below panels
  root.insertBefore(eggPop.el, root.querySelector('.hud-modal'))
  wheel = createSpinWheel(root, overlayCtx) // full-screen overlay above the HUD, below the hatch
  root.appendChild(hatchEl)
  document.body.appendChild(root)

  // --- Toasts ---------------------------------------------------------------------------------
  function toast(text, kind = 'info') {
    if (!text) return
    if (toastsHeld) {
      heldToasts.push([text, kind])
      return
    }
    const last = toasts.lastElementChild
    if (last && last._text === text && !last.classList.contains('is-out')) {
      last._count = (last._count || 1) + 1
      last.querySelector('.hud-toast-n').textContent = `x${last._count}`
      clearTimeout(last._timer)
      last._timer = setTimeout(() => dismissToast(last), 2600)
      return
    }
    const el = h('div', `hud-toast is-${kind}`, `<span class="hud-ol">${esc(text)}</span><span class="hud-toast-n hud-ol"></span>`)
    el._text = text
    toasts.appendChild(el)
    while (toasts.children.length > 4) toasts.firstElementChild.remove()
    el._timer = setTimeout(() => dismissToast(el), kind === 'error' ? 2200 : 2800)
  }
  function dismissToast(el) {
    el.classList.add('is-out')
    setTimeout(() => el.remove(), 320)
  }

  // --- Level up (many level-ups in one frame collapse into one banner) --------------------------
  let luPending = null
  let luWins = 0
  let luTimer = 0
  function levelUp({ level, wins = 0 }) {
    if (!luPending) {
      luPending = { level, wins: 0 }
      requestAnimationFrame(flushLevelUp)
    }
    luPending.level = Math.max(luPending.level, level)
    luPending.wins += wins
  }
  function flushLevelUp() {
    if (!luPending) return
    const showing = lvl.classList.contains('is-on')
    luWins = (showing ? luWins : 0) + luPending.wins
    lvlSub.textContent = `Level ${luPending.level}${luWins ? `  •  +${fmt(luWins)} Wins` : ''}`
    luPending = null
    lvl.classList.remove('is-on')
    void lvl.offsetWidth
    lvl.classList.add('is-on')
    clearTimeout(luTimer)
    luTimer = setTimeout(() => lvl.classList.remove('is-on'), 2400)
  }

  // --- Hatch reveal ---------------------------------------------------------------------------------
  const hatchQueue = []
  let hatchTimers = []
  let hatchStage = 0 // 0 idle, 1 shaking, 2 revealed
  function showHatch(data) {
    if (!data?.def && !data?.pet) return
    hatchQueue.push(data)
    if (!hatchShowing) nextHatch()
  }
  function later(ms, fn) {
    hatchTimers.push(setTimeout(fn, ms))
  }
  function nextHatch() {
    hatchTimers.forEach(clearTimeout)
    hatchTimers = []
    const data = hatchQueue.shift()
    if (!data) {
      hatchShowing = false
      hatchStage = 0
      hatchEl.hidden = true
      hatchEl.className = 'hud-hatch'
      return
    }
    if (document.pointerLockElement) document.exitPointerLock?.()
    hatchShowing = true
    hatchStage = 1
    const def = data.def || {}
    const egg = data.egg || {}
    hEgg.innerHTML = eggIcon(egg)
    hPet.innerHTML = petIcon(def)
    hName.textContent = def.name || 'New Pet'
    hRar.textContent = def.rarity || ''
    hBoost.textContent = `${multText(def.mult)} Speed`
    hatchEl.style.setProperty('--rar', rarityColor(def.rarity))
    hatchEl.style.setProperty('--egg', egg.color || '#f4ead2')
    hatchEl.className = 'hud-hatch is-shaking'
    hatchEl.hidden = false
    later(1000, () => hatchEl.classList.add('is-cracked'))
    later(1700, reveal)
  }
  function reveal() {
    hatchTimers.forEach(clearTimeout)
    hatchTimers = []
    hatchStage = 2
    hatchEl.className = 'hud-hatch is-cracked is-burst is-revealed'
    later(3400, nextHatch)
  }
  hatchEl.addEventListener('click', (e) => {
    e.stopPropagation()
    if (hatchStage === 1) reveal()
    else if (hatchStage === 2) nextHatch()
  })

  // --- Keyboard: E for the prompt, Esc closes panels/hatch (capture: before input.js) ------------
  let curPrompt = null
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape') {
        if (hatchShowing) {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (hatchStage === 1) reveal()
          else nextHatch()
          return
        }
        if (panels.isOpen() || wheel.isOpen()) {
          e.preventDefault()
          e.stopImmediatePropagation()
          panels.close()
          wheel.close()
        }
        return
      }
      if (e.code !== 'KeyE' || e.repeat || panels.isOpen() || wheel.isOpen() || hatchShowing) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return
      if (curPrompt?.action) {
        e.preventDefault()
        curPrompt.action()
      }
    },
    true,
  )

  // --- Per-frame update (DOM writes only on change) ------------------------------------------
  let lastBoulder = ''
  let lastPromptText = null
  let statAcc = 1
  let slowAcc = 1
  let lastPct = -1
  const flags = { speed: null, wins: null, x2: null, rebirth: null, daily: null, spin: null }
  const flag = (key, v, fn) => {
    if (flags[key] !== v) {
      flags[key] = v
      fn(v)
    }
  }

  function refreshStats() {
    setText(winsN, fmt(state.wins))
    setText(gemsN, fmt(state.gems))
    setText(speedEl, `Speed: ${fmt(state.speed)}`)
    setText(multEl, `x${parseFloat(multiplier().toFixed(2))} Multiplier`)
    const need = xpNeeded()
    setText(barL, `Level ${state.level}`)
    setText(barR, `${fmt(state.xp)}/${fmt(need)}`)
    const pct = Math.round(Math.min(1, Math.max(0, state.xp / need)) * 1000) / 10
    if (pct !== lastPct) {
      lastPct = pct
      barFill.style.width = `${pct}%`
    }
    setText(csVal, state.customSpeed >= ECONOMY.customSpeedMax ? 'MAX' : String(state.customSpeed))
    setText(csMax, `MAX: ${rideMax()}`)
    setText(csNext, nextText())
    const sOn = boostActive('speed')
    const wOn = boostActive('wins')
    flag('speed', sOn, (v) => {
      speedBtn.classList.toggle('is-active', v)
      speedBtn.querySelector('.hud-on').hidden = !v
    })
    flag('wins', wOn, (v) => {
      winsBtn.classList.toggle('is-active', v)
      winsBtn.querySelector('.hud-on').hidden = !v
    })
    flag('x2', sOn, (v) => (x2El.style.visibility = v ? 'visible' : 'hidden'))
  }

  function refreshSlow() {
    flag('rebirth', canRebirth(), (v) => (rebirthBtn.querySelector('.hud-dot').hidden = !v))
    flag('daily', dailyReadyIn() === 0, (v) => {
      dailyBtn.querySelector('.hud-dot').hidden = !v
      dailyBtn.classList.toggle('is-ready', v)
    })
    flag('spin', state.spins > 0, (v) => {
      spinBtn.querySelector('.hud-dot').hidden = !v
      spinBtn.classList.toggle('is-ready', v)
    })
    for (const [b, kind] of [[speedBtn, 'speed'], [winsBtn, 'wins']]) {
      if (!flags[kind]) continue
      const left = boostLeft(kind)
      setText(b.querySelector('.hud-on'), left > 1e8 ? 'ON' : clock(left))
    }
    const d = new Date().getDate()
    if (d !== calDay) {
      calDay = d
      dailyBtn.querySelector('.hud-cal').innerHTML = calendarIcon(d)
    }
  }

  function setBoulder(level) {
    const b = BOULDER[level] ? level : 'SLOW'
    if (b === lastBoulder) return
    lastBoulder = b
    bWord.textContent = b
    bFace.textContent = BOULDER[b].face
    bStatus.className = `hud-bstatus ${BOULDER[b].cls}`
  }

  function setPrompt(p) {
    curPrompt = p && p.text ? p : null
    const text = curPrompt ? String(curPrompt.text) : null
    if (text === lastPromptText) return
    lastPromptText = text
    promptBtn.hidden = !text
    if (text) promptT.textContent = text
  }

  // Event subscriptions
  on('toast', (d) => toast(d?.text, d?.kind))
  on('hatch', (d) => showHatch(d))
  on('levelup', (d) => levelUp(d))

  refreshStats()
  refreshSlow()
  setBoulder('SLOW')

  return {
    update(dt = 0, info = {}) {
      setBoulder(info?.boulder)
      setPrompt(info?.prompt ?? null)
      statAcc += dt
      if (statAcc >= 0.1) {
        statAcc = 0
        refreshStats()
      }
      slowAcc += dt
      if (slowAcc >= 0.5) {
        slowAcc = 0
        refreshSlow()
      }
      panels.update(dt)
      wheel.update(dt)
      eggPop.update(dt, info?.prompt?.egg ?? null, panels.isOpen() || wheel.isOpen() || hatchShowing)
    },
    toast,
    showHatch,
    levelUp,
    isOpen: () => panels.isOpen() || wheel.isOpen() || hatchShowing,
    // extras (optional)
    openPanel: (name) => {
      if (name === 'spin') return openWheel()
      wheel.close()
      panels.open(name)
    },
    closePanel: () => {
      panels.close()
      wheel.close()
    },
    root,
  }
}
