// The spin wheel overlay: a lava-rimmed prize wheel with a crystal pointer, the
// "Spin (N)" button and free-spin countdown under it, spin packs on the right and
// a red X. Opened from the HUD's Spin! button; it is not one of the card panels.
//   const wheel = createSpinWheel(root, { toast, holdToasts, onChange })
//   wheel.open() / close() / toggle() / isOpen() / update(dt)  (update every frame)
// Rules live in game/state.js (spin(), spinReadyIn(), premium({ spins })); the slices,
// chances and packs are SPIN in config.js. The audio hooks follow .hud-wheel's
// is-spinning class and .hud-wheel-disc's transition, and the overlay's hidden flag.
import { ALL_BIKES, SPIN } from '../config.js'
import { buySpins, fmt, spin, spinReadyIn, state } from '../game/state.js'
import { ICONS, esc } from './icons.js'
import { bikeArt, cometArt, place, shoeArt, winsArt } from './prizeart.js'
import { btn, h, setText } from './panels.js'

const INK = '#1d1238'
const TEXT_INK = '#22104a'
const R = 158 // slice radius in the wheel's viewBox (-200..200); the lava rim runs R..196
const N = SPIN.slices.length
const SPAN = 360 / N

const P = (r, deg) => {
  const a = (deg * Math.PI) / 180
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`
}
// Small deterministic random so the rim looks the same every time it is built.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function prizeArt(s) {
  if (s.icon === 'bike') return bikeArt(ALL_BIKES.find((b) => b.id === s.bike) || {}, true)
  if (s.icon === 'trail') return cometArt()
  if (s.icon === 'wins') return winsArt()
  return shoeArt(s.shoe || '#4aa8ff')
}

// --- The wheel ---------------------------------------------------------------------------
// The disc (slices, studs, labels, art) turns; the rim, hub and crystal pointer stay put.
function discSvg() {
  const defs = []
  const body = []
  SPIN.slices.forEach((s, i) => {
    const a = i * SPAN
    const path = `M0 0L${P(R, -SPAN / 2)}A${R} ${R} 0 0 1 ${P(R, SPAN / 2)}Z`
    let fill
    if (s.color === 'rainbow') {
      defs.push(`<linearGradient id="sw-g${i}" gradientUnits="userSpaceOnUse" x1="-80" y1="-150" x2="80" y2="-30">
        <stop offset="0" stop-color="#ff3d3d"/><stop offset=".2" stop-color="#ff9d1f"/><stop offset=".38" stop-color="#ffe11f"/>
        <stop offset=".55" stop-color="#5fe04c"/><stop offset=".72" stop-color="#21d8ff"/><stop offset=".86" stop-color="#3d6bff"/><stop offset="1" stop-color="#c34dff"/></linearGradient>`)
    } else {
      defs.push(`<radialGradient id="sw-g${i}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${R}"><stop offset=".15" stop-color="${s.color}"/><stop offset=".7" stop-color="${s.color}"/><stop offset="1" stop-color="${s.color2 || s.color}"/></radialGradient>`)
    }
    fill = `url(#sw-g${i})`
    const lines = s.lines || [s.label || '']
    const text = (str, y, size) => `<text x="0" y="${y}" font-size="${size}" class="hud-sw-txt">${esc(str)}</text>`
    let labels = ''
    if (lines.length === 1) labels = text(lines[0], -128, lines[0].length > 6 ? 21 : 24)
    else labels = text(lines[0], -134, lines[0].length > 5 ? 22 : 25) + text(lines[1], -110, lines[1].length > 5 ? 22 : 25)
    body.push(`<g class="hud-sw-slice" data-i="${i}" transform="rotate(${a})">
      <path d="${path}" fill="${fill}"/>
      <path d="${path}" fill="url(#sw-studs)"/>
      <path class="hud-sw-flash" d="${path}" fill="#fff"/>
      ${place(prizeArt(s), 0, -77, s.icon === 'bike' ? 82 : 62)}
      ${labels}
      ${text(`${s.chance}%`, -36, 15)}
    </g>`)
  })
  const lines = SPIN.slices.map((_, i) => `<path d="M0 0L${P(R, i * SPAN - SPAN / 2)}" stroke="rgba(40,10,70,.35)" stroke-width="2"/>`).join('')
  return `<svg viewBox="-200 -200 400 400" aria-hidden="true" focusable="false">
    <defs>${defs.join('')}
      <pattern id="sw-studs" width="15" height="15" patternUnits="userSpaceOnUse">
        <rect x="2" y="2" width="11" height="11" rx="2.2" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.3"/>
        <path d="M3 13h10V3" fill="none" stroke="#000" stroke-opacity=".1" stroke-width="1.3"/>
      </pattern>
    </defs>
    ${body.join('')}${lines}
  </svg>`
}

function rimSvg() {
  const r = rng(7)
  let blobs = ''
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * 360 + r() * 4
    const [x, y] = P(190 + r() * 3, a).split(' ')
    blobs += `<circle cx="${x}" cy="${y}" r="${7 + r() * 5}" fill="${r() < 0.5 ? '#ff5a0a' : '#ff7a12'}"/>`
  }
  let cracks = ''
  for (let k = 0; k < 30; k++) {
    const a = r() * 360
    const r0 = 162 + r() * 28
    cracks += `<path d="M${P(r0, a)}L${P(r0 + (r() - 0.5) * 10, a + 2 + r() * 3)}L${P(r0 + (r() - 0.5) * 12, a + 4 + r() * 5)}" stroke="#ffe14a" stroke-width="${1.6 + r() * 1.6}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  let rocks = ''
  const nRocks = 18
  for (let k = 0; k < nRocks; k++) {
    const a = (k / nRocks) * 360 + 6 + r() * 6
    const [cx, cy] = P(177 + (r() - 0.5) * 6, a).split(' ').map(Number)
    const size = 16 + r() * 6
    const sides = 5 + Math.floor(r() * 3)
    const rot = r() * 360
    let pts = ''
    let hi = ''
    for (let v = 0; v < sides; v++) {
      const t = ((v / sides) * 360 + rot + r() * 20) * (Math.PI / 180)
      const rr = size * (0.75 + r() * 0.3)
      pts += `${(cx + rr * Math.cos(t)).toFixed(1)},${(cy + rr * Math.sin(t)).toFixed(1)} `
      hi += `${(cx - size * 0.15 + rr * 0.55 * Math.cos(t)).toFixed(1)},${(cy - size * 0.2 + rr * 0.55 * Math.sin(t)).toFixed(1)} `
    }
    rocks += `<polygon points="${pts}" fill="#2b2530" stroke="#120d18" stroke-width="2.4" stroke-linejoin="round"/><polygon points="${hi}" fill="#4a4256"/>`
  }
  return `<svg viewBox="-200 -200 400 400" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="sw-lava" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="200">
        <stop offset=".78" stop-color="#ffd21f"/><stop offset=".84" stop-color="#ff8a12"/><stop offset=".92" stop-color="#ff4a06"/><stop offset="1" stop-color="#d42400"/>
      </radialGradient>
      <radialGradient id="sw-hub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffb26a"/><stop offset=".45" stop-color="#ff4a0a"/><stop offset="1" stop-color="#b01400"/></radialGradient>
    </defs>
    ${blobs}
    <circle r="177" fill="none" stroke="url(#sw-lava)" stroke-width="38"/>
    ${cracks}${rocks}
    <circle r="160" fill="none" stroke="#ffcf3a" stroke-width="2" opacity=".8"/>
    <circle r="158" fill="none" stroke="#5a1206" stroke-width="3.5"/>
    <g class="hud-sw-hub">
      <circle r="31" fill="#ff6a12" stroke="#7a1000" stroke-width="3"/>
      <circle r="25" fill="url(#sw-hub)" stroke="#7a1000" stroke-width="2.5"/>
      <circle r="15" fill="none" stroke="#ffb24a" stroke-width="2.5" stroke-dasharray="5 4" opacity=".9"/>
      <path d="M-14 -8c4-8 12-11 19-9" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>
    </g>
    <g class="hud-sw-crystal" transform="translate(0 -176)">
      <polygon points="0,-44 -9,-14 -24,-10 -9,-4 0,36 9,-4 24,-10 9,-14" fill="#e8262e" stroke="#4a0610" stroke-width="3" stroke-linejoin="round"/>
      <polygon points="0,-44 -9,-14 0,-8" fill="#ff8a7a"/>
      <polygon points="0,-44 9,-14 0,-8" fill="#ff4a42"/>
      <polygon points="-9,-14 -24,-10 -9,-4 0,-8" fill="#ff5a4a"/>
      <polygon points="9,-14 24,-10 9,-4 0,-8" fill="#b80e1a"/>
      <polygon points="-9,-4 0,-8 0,36" fill="#d8141e"/>
      <polygon points="9,-4 0,-8 0,36" fill="#9a0814"/>
      <polygon points="0,-44 -9,-14 -24,-10 -9,-4 0,36 9,-4 24,-10 9,-14" fill="none" stroke="#4a0610" stroke-width="3" stroke-linejoin="round"/>
      <path d="M-3 -32l-3 12" stroke="#fff" stroke-width="2.5" opacity=".75" stroke-linecap="round"/>
    </g>
  </svg>`
}

const hms = (s) => {
  s = Math.max(0, Math.ceil(s))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

export function createSpinWheel(root, ctx) {
  const el = h('div', 'hud-sw')
  el.hidden = true
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', 'Spin the wheel')

  const stage = h('div', 'hud-sw-stage')
  const wheelBox = h('div', 'hud-sw-wheelbox')
  const wheel = h('div', 'hud-wheel hud-sw-wheel')
  wheel.innerHTML = `<div class="hud-wheel-disc">${discSvg()}</div><div class="hud-sw-rim">${rimSvg()}</div>`
  const disc = wheel.querySelector('.hud-wheel-disc')
  const close = btn(
    'hud-sw-x',
    `<svg viewBox="0 0 40 40"><path d="M11 11l18 18M29 11L11 29" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M11 11l18 18M29 11L11 29" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/></svg>`,
    () => api.close(),
  )
  close.setAttribute('aria-label', 'Close')
  wheelBox.append(wheel, close)

  const spinBtn = btn('hud-sw-spin', `<span class="hud-sw-spin-t hud-ol">Spin (0)</span>`, () => doSpin())
  const spinT = spinBtn.querySelector('.hud-sw-spin-t')
  const timer = h('div', 'hud-sw-timer hud-ol', '')

  const buy = h('div', 'hud-sw-buy')
  for (const p of SPIN.packs) {
    const b = btn(
      `hud-sw-pack is-${p.look}`,
      `<span class="hud-sw-pack-face"><span class="hud-sw-coin">${ICONS.trophy}</span><span class="hud-sw-price hud-ol">${fmt(p.price)}</span></span>
       <span class="hud-sw-pack-l hud-ol">Buy ${p.spins}</span>${p.tag ? `<span class="hud-sw-tag hud-ol">${esc(p.tag)}</span>` : ''}`,
      () => {
        if (buySpins(p)) ctx.toast(`+${p.spins} Spin${p.spins > 1 ? 's' : ''}!`, 'good')
        refresh()
      },
    )
    b.setAttribute('aria-label', `Buy ${p.spins} spin${p.spins > 1 ? 's' : ''} for ${p.price} wins`)
    buy.appendChild(b)
  }

  stage.append(wheelBox, buy, spinBtn, timer)
  el.appendChild(stage)
  root.appendChild(el)

  let rot = 0
  let spinning = false
  let doneTimer = 0
  let winTimer = 0

  function doSpin() {
    if (spinning) return
    ctx.holdToasts(true)
    const k = spin()
    if (k < 0) {
      ctx.holdToasts(false)
      ctx.toast('No spins left! Buy more or wait for a free spin', 'error')
      buy.classList.remove('is-nudge')
      void buy.offsetWidth
      buy.classList.add('is-nudge')
      return
    }
    clearTimeout(winTimer)
    wheel.querySelector('.hud-sw-slice.is-win')?.classList.remove('is-win')
    // Slice k is centred k x SPAN clockwise from the top: turn the disc so it ends under the crystal.
    const jitter = (Math.random() - 0.5) * SPAN * 0.7
    const target = (((-k * SPAN + jitter) % 360) + 360) % 360
    rot = rot - (rot % 360) + 360 * SPIN.turns + target
    spinning = true
    wheel.classList.add('is-spinning')
    disc.style.transition = `transform ${SPIN.seconds}s cubic-bezier(0.12, 0.6, 0.1, 1)`
    disc.style.transform = `rotate(${rot}deg)`
    refresh()
    clearTimeout(doneTimer)
    doneTimer = setTimeout(() => {
      spinning = false
      wheel.classList.remove('is-spinning')
      disc.style.transition = ''
      const win = wheel.querySelector(`.hud-sw-slice[data-i="${k}"]`)
      win?.classList.add('is-win')
      winTimer = setTimeout(() => win?.classList.remove('is-win'), 1800)
      ctx.holdToasts(false)
      refresh()
    }, SPIN.seconds * 1000 + 100)
  }

  function refresh() {
    setText(spinT, `Spin (${fmt(state.spins)})`)
    setText(timer, `+1 Free Spin in: ${hms(spinReadyIn())}`)
    spinBtn.classList.toggle('is-empty', state.spins <= 0)
    spinBtn.classList.toggle('is-busy', spinning)
  }

  let acc = 0
  const api = {
    open() {
      if (document.pointerLockElement) document.exitPointerLock?.()
      el.hidden = false
      el.classList.remove('is-pop')
      void el.offsetWidth
      el.classList.add('is-pop')
      refresh()
      ctx.onChange?.(true)
    },
    close() {
      if (el.hidden) return
      el.hidden = true
      if (spinning) ctx.holdToasts(false) // the prize is already granted: show it now
      ctx.onChange?.(false)
    },
    toggle() {
      if (el.hidden) api.open()
      else api.close()
    },
    isOpen: () => !el.hidden,
    update(dt) {
      if (el.hidden) return
      acc += dt
      if (acc < 0.25) return
      acc = 0
      refresh()
    },
    el,
  }
  return api
}
