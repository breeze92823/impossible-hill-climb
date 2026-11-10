import { Quaternion, Vector3 } from 'three'
import './intro.css'
import { CAMERA, INTRO, LANE, SPAWN, SPAWN_FACING } from '../config.js'
import { heightAt, zAt } from '../lobby/lane.js'
import { syncYawToPlayer, update as updateCamera } from '../camera.js'
import { markIntroSeen, state } from './state.js'
import { isGuest, net } from '../net.js'

// The new-player intro: a short scripted film shot with the real scene. The player's
// own rider (avatar + equipped bike) climbs the hill, a boulder rolls down, the rider
// turns and flees, gets flattened, and wakes up at the spawn while the camera swings
// round behind them and blends into the gameplay chase cam. Letterbox bars, captions
// (INTRO.captions) and a Skip button; the HUD and touch controls hide meanwhile.
// Only new players see it: the decision waits (under the loading screen) for the server's
// save, which carries `introSeen`; guests and offline play fall back to a browser flag.
// main.js runs a reduced loop while it plays (no physics, no input, no training).

// Shot list. The rider's moves are keyed to these, so retime both together.
const SHOTS = [
  { name: 'crane', dur: 3.2 }, // high over the band, craning down behind the rider as they set off
  { name: 'front', dur: 3.3 }, // low in front, the rider coming at the lens
  { name: 'chase', dur: 3.0 }, // behind, looking up the lane: the boulder appears at the top
  { name: 'boulder', dur: 2.5 }, // low and wide at the rock rolling down; the rider brakes
  { name: 'face', dur: 2.6 }, // close on the rider's face as they turn round and flee
  { name: 'crush', dur: Infinity }, // side-on; ends CRUSH_CUT s after the boulder flattens them
  { name: 'hub', dur: 5.6 }, // back at the spawn: orbit round behind, blend into gameplay
]
const RIDE = 13 // m/s up the hill
const FLEE = 17 // m/s back down
const CRUSH_CUT = 0.75 // s from the crush to the cut (the screen fades to black over the last half)
const BLEND = 1.6 // s at the end of the hub shot spent blending into the gameplay camera
const FOOT = Math.sqrt(LANE.boulder.radius ** 2 - LANE.boulder.sink ** 2) // boulder half-length on the floor

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (v) => {
  const k = clamp01(v)
  return k * k * (3 - 2 * k)
}
const mix = (a, b, k) => a + (b - a) * k

// Dev overrides: ?intro=1 always plays it, ?intro=0 or the screenshot params (?tp, ?boulder,
// ?squash) never do. null = no override.
function devOverride() {
  if (!import.meta.env.DEV) return null
  const q = new URLSearchParams(location.search)
  if (q.get('intro') === '1') return true
  if (q.get('intro') === '0' || q.has('tp') || q.has('boulder') || q.has('squash')) return false
  return null
}
// main.js only builds the intro when it might play.
export const introAllowed = () => devOverride() !== false

function seenHere() {
  try {
    return localStorage.getItem(INTRO.storageKey) === '1'
  } catch {
    return false // storage blocked: show it (Skip is one tap)
  }
}
function markSeen() {
  markIntroSeen() // into the save: the server remembers it for this account
  try {
    localStorage.setItem(INTRO.storageKey, '1') // guests / offline
  } catch {
    // storage blocked
  }
}

// Play it? true / false, or null while the save is still on its way (waited: s since boot).
function decide(waited) {
  const forced = devOverride()
  if (forced !== null) return forced
  if (state.introSeen || state.played > INTRO.veteranPlayed) return false // a loaded save says: not new
  if (net.hydrated) return isGuest() ? !seenHere() : true // a save (or "new account") answer arrived
  if (waited < INTRO.waitForSave) return null
  return !seenHere() // no answer in time (offline / slow server)
}

// ctx: { camera, rider, lane, pack, onCrush(at), onDone(skipped) }
export function createIntro({ camera, rider, lane, pack, onCrush, onDone }) {
  // --- Overlay: letterbox, caption, fade, Skip ---------------------------------------
  const root = document.createElement('div')
  root.className = 'intro-root'
  root.innerHTML = '<div class="intro-bar intro-top"></div><div class="intro-bar intro-bottom"></div><div class="intro-fade"></div><div class="intro-cap"></div><button type="button" class="intro-skip" aria-label="Skip intro"><span class="intro-skip-i">&#187;</span> Skip</button>'
  const cap = root.querySelector('.intro-cap')
  const fade = root.querySelector('.intro-fade')
  const skipBtn = root.querySelector('.intro-skip')
  document.body.appendChild(root)
  document.body.classList.add('intro-on')
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    finish(true)
  })
  const onKeyDown = (e) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault()
      finish(true)
    }
  }
  window.addEventListener('keydown', onKeyDown)

  // --- Rider + boulder state -------------------------------------------------------------
  const r = { x: 0, s: -4, facing: Math.PI, v: 0, crushed: -1 } // crushed: s since the crush, -1 = not yet
  let boulder = null
  let shot = 0
  let shotT = 0
  let started = false
  let done = false
  const born = performance.now() // the save wait is wall-clock time, not (clamped) frame time
  const waited = () => (performance.now() - born) / 1000
  let capKey = ''
  rider.setTrail(null) // a trail would streak across the cuts (main.js puts it back)
  if (pack) pack.root.visible = false // pets can't keep up on the hill; they appear at the spawn
  rider.setVisible(true)

  // Scratch
  const pos = new Vector3()
  const look = new Vector3()
  const cinePos = new Vector3()
  const cineQuat = new Quaternion()
  const at = (v, x, s, up) => v.set(x, heightAt(s) + up, zAt(s)) // lane coords -> world
  const riderPos = { x: 0, y: 0, z: 0 }

  function toward(target, acc, dt) {
    r.v = r.v < target ? Math.min(target, r.v + acc * dt) : Math.max(target, r.v - acc * dt)
  }

  // --- The rider's part, per shot ------------------------------------------------------
  function moveRider(dt) {
    const name = SHOTS[shot].name
    if (name === 'hub') return
    let dir = 1 // +1 uphill (facing north), -1 downhill
    if (r.crushed >= 0) {
      r.crushed += dt
      r.v = 0
      const k = Math.min(1, r.crushed / 0.08)
      rider.group.scale.set(1 + 0.6 * k, 1 - 0.86 * k, 1 + 0.6 * k)
      dir = -1
    } else if (name === 'crane' || name === 'front' || name === 'chase' || (name === 'boulder' && shotT < 1.5)) {
      if (name !== 'crane' || shotT > 0.6) toward(RIDE, 9, dt)
    } else if (name === 'boulder') {
      toward(0, 14, dt) // brakes at the sight of it
    } else if (name === 'face' && shotT < 0.8) {
      toward(0, 14, dt)
      r.facing = Math.PI + Math.PI * ease(shotT / 0.8) // turns round, the long way past the camera
    } else {
      r.facing = Math.PI * 2
      toward(FLEE, 12, dt)
      dir = -1
    }
    const turning = name === 'face' && shotT < 0.8
    if (dir > 0 && !turning) {
      // A lazy weave on the way up; the bike points along its path.
      const xWas = r.x
      r.x = 2.2 * Math.sin(Math.max(0, r.s + 4) * 0.045)
      const vx = dt > 0 ? (r.x - xWas) / dt : 0
      r.facing = Math.atan2(vx, -Math.max(r.v, 0.5)) // (sin f, cos f) along (vx, -v): PI = straight up
    }
    r.s += dir * r.v * dt

    // The boulder: appears at the top during the chase shot, rolls at a constant speed.
    if (!boulder && (shot > 2 || (name === 'chase' && shotT >= 0.5))) {
      const B = INTRO.boulder
      boulder = lane.cinematic(B.s, B.speed, B.kind, B.mode)
    }
    if (boulder && r.crushed < 0 && boulder.alive && (name === 'face' || name === 'crush')) {
      if (boulder.s - r.s < FOOT * 0.8 || (name === 'crush' && shotT > 2.6)) {
        r.crushed = 0
        onCrush?.({ x: r.x, y: heightAt(Math.max(0, r.s)), z: zAt(r.s) })
      }
    }
  }

  function placeRider(dt, t) {
    if (SHOTS[shot].name === 'hub') {
      riderPos.x = SPAWN.x
      riderPos.y = SPAWN.y
      riderPos.z = SPAWN.z
      r.facing = SPAWN_FACING
      r.v = 0
      // Lying flat, then springing back into shape with a wobble.
      const u = shotT - 0.9
      const k = u <= 0 ? 0 : 1 - Math.exp(-7 * u) * Math.cos(16 * u) // 0 = flat, springs to 1
      rider.group.scale.set(1 + 0.6 * (1 - k), 0.14 + 0.86 * k, 1 + 0.6 * (1 - k))
    } else {
      riderPos.x = r.x
      riderPos.y = heightAt(Math.max(0, r.s))
      riderPos.z = zAt(r.s)
    }
    rider.update(dt, t, { ...riderPos, facing: r.facing, speed: r.v, distance: r.v * dt, grounded: true, vy: 0 })
  }

  // --- The camera, per shot ----------------------------------------------------------------
  let anchor = 0 // lane s the current shot is framed from
  let fov = CAMERA.fov
  function frame(dt) {
    const name = SHOTS[shot].name
    const u = shotT
    const k = u / SHOTS[shot].dur
    if (name === 'crane') {
      const e = ease(k)
      at(pos, 1.5 * e, mix(-34, r.s - 11, e), mix(17, 4.2, e))
      at(look, r.x * 0.5 * e, mix(150, r.s + 40, e), mix(4, 1.6, e))
      fov = 62
    } else if (name === 'front') {
      at(pos, r.x + 3.2, r.s + 10 - 2.1 * u, 1.05)
      at(look, r.x, r.s, 1.35)
      fov = 52
    } else if (name === 'chase') {
      at(pos, r.x * 0.6 + 1.3, r.s - 6.5, 2.3)
      at(look, r.x * 0.3, r.s + 32, 0.5)
      fov = 66
    } else if (name === 'boulder') {
      if (anchor === 0) anchor = r.s
      at(pos, -7.5 + 1.5 * k, anchor - 7 + 5 * ease(k), 1.7)
      const bs = boulder ? boulder.s : anchor + 150
      at(look, r.x * 0.4, mix(r.s, bs, 0.6), 6)
      fov = 58
    } else if (name === 'face') {
      at(pos, r.x + 0.9, r.s - 3.3, 2.05)
      at(look, r.x, r.s, 1.75)
      fov = 50
    } else if (name === 'crush') {
      if (anchor === 0) anchor = r.s - 30
      // Fixed on the lane side; once the rock gets close the camera backs off ahead of it.
      const camS = boulder?.alive ? Math.min(anchor, boulder.s - FOOT - 19) : anchor
      at(pos, 9, camS, 6.5)
      at(look, r.x, r.s, 1)
      if (boulder?.alive) look.lerp(boulder.holder.position, 0.22)
      fov = 64
    } else {
      // hub: orbit from the rider's front-left round to behind them, then blend into gameplay
      const e = ease(u / (SHOTS[shot].dur - BLEND * 0.5))
      const th = mix(Math.PI - 0.7, 0.18, e)
      const R = mix(4.8, 12.5, e)
      pos.set(SPAWN.x + Math.sin(th) * R, SPAWN.y + mix(1.3, 4.6, e), SPAWN.z + Math.cos(th) * R)
      look.set(SPAWN.x, SPAWN.y + mix(1.5, 2.2, e), SPAWN.z)
      fov = mix(55, CAMERA.fov, e)
    }
    camera.position.copy(pos)
    camera.lookAt(look)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    if (name === 'hub' && u > SHOTS[shot].dur - BLEND) {
      // Blend into wherever the gameplay chase cam wants to be.
      const b = ease((u - (SHOTS[shot].dur - BLEND)) / BLEND)
      cinePos.copy(camera.position)
      cineQuat.copy(camera.quaternion)
      const cineFov = camera.fov
      updateCamera(camera, dt)
      camera.position.lerpVectors(cinePos, camera.position, b)
      camera.quaternion.slerpQuaternions(cineQuat, camera.quaternion, b)
      camera.fov = mix(cineFov, camera.fov, b)
      camera.updateProjectionMatrix()
    }
  }

  // --- Captions + fade ----------------------------------------------------------------------
  function overlay() {
    const name = SHOTS[shot].name
    const c = INTRO.captions.find((x) => x.shot === name && shotT >= x.from && shotT < x.to)
    const key = c ? `${name}:${c.text}` : ''
    if (key !== capKey) {
      capKey = key
      cap.classList.remove('on')
      if (c) {
        cap.textContent = c.text
        cap.dataset.kind = c.kind ?? 'line'
        void cap.offsetWidth // restart the pop-in
        cap.classList.add('on')
      }
    }
    let black = 0
    if (name === 'crush' && r.crushed >= 0) black = clamp01((r.crushed - (CRUSH_CUT - 0.4)) / 0.35)
    else if (name === 'hub') black = 1 - clamp01(shotT / 0.45)
    fade.style.opacity = black.toFixed(3)
    if (name === 'hub' && shotT > SHOTS[shot].dur - BLEND * 0.8) root.classList.remove('bars-on')
  }

  function nextShot() {
    shot++
    shotT = 0
    anchor = 0
    if (SHOTS[shot]?.name === 'hub') {
      // Wake up at the spawn (still flat for a moment, see placeRider), pets back,
      // gameplay camera lined up behind.
      if (pack) {
        pack.rebuild({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z })
        pack.root.visible = true
      }
      syncYawToPlayer()
    }
  }

  function finish(skipped) {
    if (done) return
    done = true
    markSeen()
    if (!started) root.remove() // decided against it under the loading screen: nothing to fade
    window.removeEventListener('keydown', onKeyDown)
    if (skipped) lane.clear()
    rider.group.scale.set(1, 1, 1)
    if (pack) pack.root.visible = true
    document.body.classList.remove('intro-on')
    root.classList.remove('bars-on')
    root.classList.add('out')
    setTimeout(() => root.remove(), 700)
    onDone?.(skipped)
  }

  return {
    get done() {
      return done
    },
    get speed() {
      return r.v
    },
    get shot() {
      return `${SHOTS[shot]?.name} ${shotT.toFixed(2)}`
    },
    focus: riderPos,
    // dt = 0 holds the first frame (while the platform's loading screen is still up).
    // True while it is still waiting to hear whether this is a new player (main.js keeps the
    // loading screen up meanwhile).
    get waiting() {
      return !done && !started && decide(waited()) === null
    },
    // loading: the platform's loading screen is still up (the film holds its first frame).
    update(dt, t, loading) {
      if (done) return riderPos
      if (!started) {
        const play = decide(waited())
        if (play === false) {
          finish(true)
          return riderPos
        }
        if (play === true && !loading) {
          started = true
          root.classList.add('playing', 'bars-on') // bars slide in, Skip appears
        } else dt = 0 // hold the first frame
      } else if (devOverride() === null && (state.introSeen || state.played > INTRO.veteranPlayed)) {
        finish(true) // the save arrived late and says this player has been here before
        return riderPos
      }
      if (dt > 0) {
        shotT += dt
        const cur = SHOTS[shot]
        if (cur.name === 'crush' ? r.crushed >= CRUSH_CUT : shotT >= cur.dur) {
          if (shot === SHOTS.length - 1) {
            finish(false)
            return riderPos
          }
          nextShot()
        }
        moveRider(dt)
      }
      placeRider(dt, t)
      frame(dt)
      overlay()
      return riderPos
    },
    skip: () => finish(true),
  }
}
