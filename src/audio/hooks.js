// Wires the game's UI and state events to sounds, so main.js only calls
// installAudioHooks() once (after createHud()):
//  - audio unlock on the first gesture (core.js) + suspend while the tab is hidden
//  - state events: 'levelup' -> levelUp, 'bike' -> equip, 'toast' error -> error,
//    reward -> coin (the chest's "Free Rewards" -> chest, "Rebirth" -> levelUp, the
//    spin wheel's own toast is skipped: the wheel below has its sound), wins/gems
//    going down on 'change' -> purchase
//  - HUD DOM (one MutationObserver on .hud-root):
//      .hud-modal / .hud-sw (spin wheel) hidden toggles -> open()/close() and the world ducks under them
//      .hud-hatch classes (is-shaking / is-cracked / is-revealed) -> hatchShake /
//        hatchCrack / hatchReveal(rarity), so the sound follows the HUD's timing even
//        when the player taps to skip or several eggs are queued
//      .hud-wheel gets is-spinning -> flapper ticks following the CSS easing, spinWin at the end
//  - a capture-phase pointerdown on HUD buttons -> click()
//  - M toggles mute, B toggles the music, each with a toast
import { SPIN } from '../config.js'
import { onKey } from '../input.js'
import { on, state, toast } from '../game/state.js'
import { installAudio, isMuted, setDucked, toggleMuted } from './core.js'
import { sfx } from './sfx.js'
import { isMusicOn, toggleMusic } from './music.js'

let installed = false

// Music on/off with a toast (B key and the touch button); returns whether it is now on.
export function musicToggle() {
  toggleMusic()
  toast(isMusicOn() ? 'Music on' : 'Music off')
  return isMusicOn()
}

export function installAudioHooks() {
  if (installed) return
  installed = true
  try {
    installAudio()
  } catch (e) {
    console.warn('[audio] install', e)
  }
  const safe = (fn) => (...args) => {
    try {
      fn(...args)
    } catch (e) {
      console.warn('[audio] hook', e)
    }
  }

  // --- State events ---------------------------------------------------------------------------
  let lastPurchase = -1e9
  on('levelup', safe(() => sfx.levelUp()))
  on(
    'bike',
    safe(() => {
      // Bought with gems a moment ago: let the till ring first.
      if (performance.now() - lastPurchase < 100) setTimeout(() => sfx.equip(), 260)
      else sfx.equip()
    }),
  )
  on(
    'toast',
    safe((d) => {
      const kind = d?.kind
      const text = String(d?.text ?? '')
      if (kind === 'error') sfx.error()
      else if (kind === 'reward') {
        if (text.startsWith('Spin')) return // the wheel plays spinWin when it stops
        if (text.startsWith('Free Rewards')) sfx.chest()
        else if (text.startsWith('Rebirth')) sfx.levelUp()
        else sfx.coin()
      }
    }),
  )
  let prevWins = state.wins
  let prevGems = state.gems
  let buyQueued = false
  on(
    'change',
    safe(() => {
      const spent = state.wins < prevWins - 1e-9 || state.gems < prevGems - 1e-9
      prevWins = state.wins
      prevGems = state.gems
      if (!spent || buyQueued) return
      buyQueued = true
      lastPurchase = performance.now()
      sfx.purchase()
      setTimeout(() => (buyQueued = false), 0)
    }),
  )

  // --- Mute key ---------------------------------------------------------------------------------
  try {
    onKey('KeyM', () => {
      toggleMuted()
      toast(isMuted() ? 'Sound off' : 'Sound on')
    })
    onKey('KeyB', musicToggle)
  } catch (e) {
    console.warn('[audio] key', e)
  }

  // --- HUD buttons ----------------------------------------------------------------------------------
  document.addEventListener(
    'pointerdown',
    safe((e) => {
      if (e.button > 0) return
      const b = e.target?.closest?.('button, [role="button"]')
      if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true' || !b.closest('.hud-root')) return
      const pan = Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2)) // a press on the left sounds left
      sfx.click(pan)
    }),
    { capture: true, passive: true },
  )

  // --- HUD DOM: panels, hatch, spin wheel ----------------------------------------------------------
  const root = document.querySelector('.hud-root')
  const modal = root?.querySelector('.hud-modal')
  const hatchEl = root?.querySelector('.hud-hatch')
  const wheelEl = root?.querySelector('.hud-sw')
  const overlayOpen = () => (modal ? !modal.hidden : false) || (wheelEl ? !wheelEl.hidden : false)
  let modalOpen = overlayOpen()
  let hatchOpen = hatchEl ? !hatchEl.hidden : false
  const hatchFlags = { shaking: false, cracked: false, revealed: false }
  const duck = () => setDucked(modalOpen || hatchOpen)

  function onModal() {
    const open = overlayOpen()
    if (open === modalOpen) return
    modalOpen = open
    if (open) sfx.open()
    else sfx.close()
    duck()
  }
  function onHatch() {
    hatchOpen = !hatchEl.hidden
    const c = hatchEl.classList
    const shaking = c.contains('is-shaking')
    const cracked = c.contains('is-cracked')
    const revealed = c.contains('is-revealed')
    if (hatchOpen && shaking && !hatchFlags.shaking) sfx.hatchShake(1.7)
    if (hatchOpen && cracked && !revealed && !hatchFlags.cracked) sfx.hatchCrack()
    if (hatchOpen && revealed && !hatchFlags.revealed) {
      const rar = hatchEl.querySelector('.hud-hatch-rar')?.textContent?.trim() || 'Common'
      sfx.hatchReveal(rar)
    }
    hatchFlags.shaking = shaking
    hatchFlags.cracked = cracked
    hatchFlags.revealed = revealed
    duck()
  }
  function onWheel(wheel, oldClass) {
    const was = /\bis-spinning\b/.test(oldClass || '')
    if (wheel.classList.contains('is-spinning') && !was) spinSounds(wheel)
  }

  if (root && typeof MutationObserver === 'function') {
    const mo = new MutationObserver(
      safe((records) => {
        let m = false
        let hh = false
        for (const r of records) {
          const el = r.target
          if (el === modal || el === wheelEl) m = true
          else if (el === hatchEl) hh = true
          else if (r.attributeName === 'class' && el.classList?.contains('hud-wheel')) onWheel(el, r.oldValue)
        }
        if (m) onModal()
        if (hh) onHatch()
      }),
    )
    mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'], attributeOldValue: true })
  }
  if (!hatchEl) {
    // No hatch overlay in the DOM: follow the HUD's documented timing instead.
    on(
      'hatch',
      safe((d) => {
        sfx.hatchShake(1.7)
        setTimeout(() => sfx.hatchCrack(), 1000)
        setTimeout(() => sfx.hatchReveal(d?.def?.rarity || 'Common'), 1700)
      }),
    )
  }
}

// --- Spin wheel ticks ---------------------------------------------------------------------------
// The disc turns ~6.5 times with a CSS cubic-bezier over a few seconds; the flapper ticks
// once per slice, so the ticks slow down exactly like the wheel.
let spinTimers = []
function spinSounds(wheel) {
  spinTimers.forEach(clearTimeout)
  spinTimers = []
  const disc = wheel.querySelector('.hud-wheel-disc')
  const tr = disc?.style?.transition || ''
  const m = tr.match(/([\d.]+)(m?s)\s+cubic-bezier\(([^)]+)\)/)
  let ms = 4000
  let p = [0.15, 0.7, 0.12, 1]
  if (m) {
    ms = parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1)
    const q = m[3].split(',').map(Number)
    if (q.length === 4 && q.every(Number.isFinite)) p = q
  }
  const slices = Math.max(2, SPIN?.slices?.length || 6)
  const total = ((SPIN?.turns ?? 6) + 0.5) * slices // slice boundaries passed
  // Sample the bezier (x = time, y = progress) and fire a tick at each boundary crossing.
  const bez = (a, b, u) => 3 * a * u * (1 - u) * (1 - u) + 3 * b * u * u * (1 - u) + u * u * u
  let next = 1
  for (let i = 1; i <= 600 && next < total; i++) {
    const u = i / 600
    const y = bez(p[1], p[3], u) * total
    while (next <= y && next < total) {
      spinTimers.push(setTimeout(() => sfx.spinTick(), bez(p[0], p[2], u) * ms))
      next++
    }
  }
  spinTimers.push(setTimeout(() => sfx.spinWin(), ms + 80))
}
