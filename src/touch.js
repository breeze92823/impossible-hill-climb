// Touch controls, shown on coarse-pointer devices (and whenever a finger touches
// the screen; a mouse click hides them again, so hybrid devices get whichever
// they are using). Bike layout, everything fed into inputState via input.js:
//   left thumb   - steer pad (◀ ▶): hold a side to turn the bike, slide across to switch
//   right thumb  - BRAKE / GAS pedals and JUMP above GAS: slide between them freely, and
//                  sliding from GAS up onto JUMP jumps without letting go of the gas
//   anywhere else - one-finger drag -> look (the camera swings back behind the bike
//                  a moment later, camera.js), two-finger pinch -> zoom
//   corner row   - camera mode, music on/off, day-night, respawn
import './touch.css'
import { COARSE_POINTER, TOUCH } from './config.js'
import { inputState, requestLock, setTouchDrive } from './input.js'

const ICONS = {
  day: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  respawn: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/></svg>',
  // A pair of eighth notes; the slash only shows while the music is off (.off).
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path class="slash" d="M3 3l18 18"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m9 4 8 8-8 8"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6"/><path d="m6 11 6-6 6 6"/></svg>',
}

function el(tag, className, html = '') {
  const e = document.createElement(tag)
  e.className = className
  e.innerHTML = html
  return e
}

// A pointerdown that fires `fn` (no click delay, no focus, no emulated mouse).
function button(className, html, fn, label) {
  const b = el('button', `touch-btn ${className}`, html)
  b.type = 'button'
  if (label) b.setAttribute('aria-label', label)
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    fn(b)
  })
  return b
}

const isFinger = (e) => e.pointerType === 'touch' || e.pointerType === 'pen'

// Keeps a finger's moves on its element even when it slides off. Throws if the
// pointer is already gone; the control still works without capture.
function capture(target, id) {
  try {
    target.setPointerCapture(id)
  } catch {
    // Ignore.
  }
}

// --- Drive state: what the held fingers add up to ---------------------------------------
const fingers = new Map() // pointerId -> { pad: 'steer' | 'pedals', key }
let driveOn = false

function pushDrive() {
  let steer = 0
  let gas = false
  let brake = false
  for (const f of fingers.values()) {
    if (f.key === 'left') steer -= 1
    else if (f.key === 'right') steer += 1
    else if (f.pedal === 'gas') gas = true
    else if (f.pedal === 'brake') brake = true
  }
  // Both pedals at once: the brake wins (a panic stop never accelerates).
  setTouchDrive(Math.max(-1, Math.min(1, steer)), brake ? -1 : gas ? 1 : 0, driveOn)
}

function setVisible(on) {
  document.body.classList.toggle('touch-ui', on)
  driveOn = on
  if (!on) fingers.clear()
  pushDrive()
}

// A pad of keys a finger can slide across: the key under the finger is held; off the pad
// it keeps the nearest one (a thumb drifting off the edge must not drop the steering).
// onEnter(finger, key, prevKey) runs whenever a finger lands on a key; keys get .on.
function slidePad(pad, name, keys, onEnter) {
  let rects = []
  const keyAt = (x, y) => {
    let best = null
    let bestD = Infinity
    for (const r of rects) {
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = r.key
      }
    }
    return best
  }
  const paint = () => {
    for (const k of keys) {
      let held = false
      // A pedal kept down while its finger sits on JUMP still shows as pressed.
      for (const f of fingers.values()) if (f.pad === name && (f.key === k.dataset.key || f.pedal === k.dataset.key)) held = true
      k.classList.toggle('on', held)
    }
  }
  const moveTo = (f, key) => {
    if (key === f.key) return
    const prev = f.key
    f.key = key
    onEnter?.(f, key, prev)
    paint()
    pushDrive()
  }

  pad.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return
    e.preventDefault()
    e.stopPropagation()
    capture(pad, e.pointerId)
    rects = keys.map((k) => {
      const r = k.getBoundingClientRect()
      return { key: k.dataset.key, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    })
    const f = { pad: name, key: null, pedal: null }
    fingers.set(e.pointerId, f)
    moveTo(f, keyAt(e.clientX, e.clientY))
  })
  pad.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId)
    if (f) moveTo(f, keyAt(e.clientX, e.clientY))
  })
  const lift = (e) => {
    if (!fingers.delete(e.pointerId)) return
    paint()
    pushDrive()
  }
  pad.addEventListener('pointerup', lift)
  pad.addEventListener('pointercancel', lift)
}

function padKey(className, key, html, label) {
  const k = el('div', `touch-btn ${className}`, html)
  k.dataset.key = key
  k.setAttribute('role', 'button')
  k.setAttribute('aria-label', label)
  return k
}

function installSteer(root) {
  const pad = el('div', 'touch-pad touch-steer')
  const keys = [padKey('steer left', 'left', ICONS.left, 'Steer left'), padKey('steer right', 'right', ICONS.right, 'Steer right')]
  pad.append(...keys)
  slidePad(pad, 'steer', keys)
  root.appendChild(pad)
}

function installPedals(root) {
  const pad = el('div', 'touch-pad touch-pedals')
  const jump = padKey('jump', 'jump', `${ICONS.jump}<span>JUMP</span>`, 'Jump')
  const brake = padKey('pedal brake', 'brake', '<i class="grip"></i><span>BRAKE</span>', 'Brake / reverse')
  const gas = padKey('pedal gas', 'gas', '<i class="grip"></i><span>GAS</span>', 'Gas')
  pad.append(jump, brake, gas)
  // A pedal stays pressed while that finger is up on JUMP (slide GAS -> JUMP keeps the gas).
  slidePad(pad, 'pedals', [jump, brake, gas], (f, key) => {
    if (key === 'jump') inputState.jump = true
    else f.pedal = key
  })
  root.appendChild(pad)
}

// Free fingers (not on a control): one drags the view, two pinch the zoom.
function installLook(zone) {
  const looks = new Map() // pointerId -> { x, y }
  let pinch = 0 // finger spread last frame, 0 = not pinching

  const spread = () => {
    const [a, b] = looks.values()
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const lift = (e) => {
    looks.delete(e.pointerId)
    pinch = looks.size >= 2 ? spread() : 0
  }

  zone.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return requestLock()
    e.preventDefault()
    capture(zone, e.pointerId)
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (looks.size >= 2) pinch = spread()
  })
  zone.addEventListener('pointermove', (e) => {
    const f = looks.get(e.pointerId)
    if (!f) return
    const dx = e.clientX - f.x
    const dy = e.clientY - f.y
    f.x = e.clientX
    f.y = e.clientY
    if (looks.size === 1) {
      inputState.look.dx += dx * TOUCH.lookScale
      inputState.look.dy += dy * TOUCH.lookScale
    } else {
      // Fingers apart = zoom in (negative notches), together = out.
      const now = spread()
      inputState.zoom -= (now - pinch) / TOUCH.pinchPixelsPerNotch
      pinch = now
    }
  })
  zone.addEventListener('pointerup', lift)
  zone.addEventListener('pointercancel', lift)
}

// actions: { mode, day, respawn, music() -> on, musicOn() } callbacks (the menu is Boxity's toolbar).
export function installTouch(actions) {
  const root = el('div', 'touch-root')
  const look = el('div', 'touch-zone touch-look')
  installLook(look)
  root.appendChild(look)
  installSteer(root)
  installPedals(root)

  const top = el('div', 'touch-top')
  const music = button('small music', ICONS.music, (b) => b.classList.toggle('off', !actions.music()), 'Music on/off')
  music.classList.toggle('off', !actions.musicOn())
  top.append(
    button('small', ICONS.cam, actions.mode, 'Camera mode'),
    music,
    button('small', ICONS.day, actions.day, 'Day / night'),
    button('small', ICONS.respawn, actions.respawn, 'Respawn'),
  )
  root.appendChild(top)
  document.body.appendChild(root)

  setVisible(COARSE_POINTER)
  // Whatever the player last used decides which controls are on screen.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (isFinger(e)) {
        if (!driveOn) setVisible(true)
      } else if (e.pointerType === 'mouse' && driveOn) setVisible(false)
    },
    { capture: true },
  )
}
