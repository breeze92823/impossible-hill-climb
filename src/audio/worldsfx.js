// Sounds of World 2 (Jungle) and World 3 (Volcano), synthesised like the rest (synth.js):
// one-shots (ramp launch, splash, croc chomp, log whack, bridge crack/collapse, meteors, burn,
// geysers, eruptions) and a looping bed per world (jungle: insects + the river; volcano: a deep
// rumble + lava crackle) faded in by setWorldBed(id). Nothing here throws (wrapped like sfx).
import { COARSE_POINTER } from '../config.js'
import { A, isMuted, now, onStart, ready, voice } from './core.js'
import { blip } from './engine.js'
import { bubbles, burst, crinkle, modal, rnd, route, tone, vary } from './synth.js'

const touch = COARSE_POINTER ? 0.6 : 1
const STONE = [[1, 1, 0.06], [1.83, 0.6, 0.04], [2.71, 0.4, 0.03], [3.9, 0.25, 0.02], [5.3, 0.12, 0.012]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
const near = (d, half = 25) => 1 / (1 + Math.pow(Math.max(0, Number(d) || 0) / half, 2))
const lastAt = new Map()
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
function buzz(pattern) {
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not allowed
  }
}

// Off the ramp: wood thunk, an engine blip and the air rushing past (longer for a faster bike).
function rampLaunch(v = 20) {
  if (!limit('ramp', 250) || !voice(1.2, 2)) return
  const t = now()
  const k = Math.min(1, v / 45)
  blip(0.8)
  modal({ t, f: vary(220, 0.05), modes: WOOD, gain: 0.25, strike: 0.2 })
  tone({ t, f: 90, f2: 50, d: 0.15, gain: 0.3 })
  burst({ t: t + 0.02, noise: 'pink', f: 500, f2: 2200 + k * 2000, q: 0.8, a: 0.15, d: 0.5 + k * 0.6, gain: 0.12 + k * 0.1 })
}
// Into the river: a heavy plunge, spray and bubbles.
function splash() {
  if (!limit('splash', 200) || !voice(1.5, 3)) return
  const t = now()
  tone({ t, f: vary(110, 0.05), f2: 45, d: 0.35, gain: 0.45 })
  burst({ t, noise: 'white', type: 'lowpass', f: 3500, f2: 700, q: 0.6, a: 0.004, d: 0.55, gain: 0.45, verb: 0.2 })
  burst({ t: t + 0.05, noise: 'pink', f: 1800, f2: 4000, q: 0.7, a: 0.08, d: 0.7, gain: 0.18 })
  bubbles({ t: t + 0.08, n: Math.round(22 * touch), dur: 0.8, f0: 200, f1: 1100, gain: 0.12, d: [0.02, 0.06], rise: 0.7, width: 0.6 })
  buzz(80)
}
// The croc's jaws: a wet snap and a growl.
function chomp() {
  if (!limit('chomp', 300) || !voice(1.2, 3)) return
  const t = now()
  modal({ t, f: vary(380, 0.05), modes: WOOD, gain: 0.45, strike: 0.4 })
  burst({ t, type: 'highpass', f: 1800, q: 0.6, a: 0.001, d: 0.05, gain: 0.35 })
  tone({ t: t + 0.03, type: 'sawtooth', f: 70, f2: 55, a: 0.04, d: 0.5, gain: 0.08, lp: 420 })
  burst({ t: t + 0.04, noise: 'brown', type: 'lowpass', f: 300, q: 0.8, a: 0.05, d: 0.5, gain: 0.25 })
  buzz([0, 60, 40, 90])
}
// Hit by a log / sweeper: a big wooden THWACK and a cartoon whistle as you fly.
function whack() {
  if (!limit('whack', 300) || !voice(1.4, 3)) return
  const t = now()
  modal({ t, f: vary(160, 0.05), modes: WOOD, gain: 0.6, strike: 0.5 })
  tone({ t, f: 70, f2: 30, d: 0.3, gain: 0.5 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, q: 0.7, a: 0.002, d: 0.25, gain: 0.4 })
  tone({ t: t + 0.12, type: 'triangle', f: 1800, f2: 500, glide: 0.8, a: 0.02, d: 0.8, gain: 0.05, verb: 0.3 })
  buzz([0, 120])
}
// A swinging log passing near: a deep swoosh.
function logSwoosh(d = 10) {
  if (!limit('swoosh', 250) || !voice(0.8, 1)) return
  const k = Math.max(0.1, near(d, 12))
  burst({ t: now(), noise: 'pink', f: 260, f2: 900, q: 0.9, a: 0.18, d: 0.35, gain: 0.22 * k, pan: rnd(-0.4, 0.4) })
}
// A bridge cracks under you, then the collapse grinds after you.
function bridgeCrack() {
  if (!limit('crack', 400) || !voice(1.2, 3)) return
  const t = now()
  for (let i = 0; i < 4; i++) modal({ t: t + i * 0.07, f: rnd(500, 1400), modes: STONE, gain: 0.25, strike: 0.4, pan: rnd(-0.5, 0.5) })
  burst({ t, type: 'highpass', f: 2000, q: 0.5, a: 0.001, d: 0.06, gain: 0.3 })
  tone({ t, f: 60, f2: 40, d: 0.5, gain: 0.3 })
}
function bridgeCollapse() {
  if (!limit('collapse', 400) || !voice(2.2, 3)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 380, f2: 200, q: 0.6, a: 0.1, d: 1.8, gain: 0.45, verb: 0.3 })
  crinkle({ t, n: Math.round(30 * touch), dur: 1.6, gain: 0.05, f0: 600, f1: 3000, width: 0.8 })
  for (let i = 0; i < Math.round(10 * touch); i++) modal({ t: t + rnd(0, 1.6), f: rnd(250, 700), modes: STONE, gain: rnd(0.06, 0.14), pan: rnd(-0.7, 0.7) })
}
// A meteor screams down; the impact is a fiery boom.
function meteorFall() {
  if (!limit('mFall', 200) || !voice(1.4, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 3000, f2: 400, q: 1.2, a: 0.6, d: 0.6, gain: 0.12, pan: rnd(-0.5, 0.5) })
  tone({ t, type: 'triangle', f: 1400, f2: 300, glide: 1.1, a: 0.3, d: 0.9, gain: 0.03 })
}
function meteorImpact(d = 10) {
  if (!voice(1.8, 3)) return
  const t = now()
  const k = Math.max(0.15, near(d, 30))
  const verb = 0.2 + 0.5 * (1 - k)
  tone({ t, f: vary(55, 0.06), f2: 24, glide: 0.6, d: 1, gain: 0.65 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 300 + 1200 * k, q: 0.7, a: 0.003, d: 0.9, gain: 0.6 * k, verb })
  burst({ t, type: 'highpass', f: 1500, q: 0.6, a: 0.001, d: 0.07, gain: 0.35 * k })
  crinkle({ t: t + 0.05, n: Math.round(24 * touch), dur: 0.9, gain: 0.05 * k, f0: 900, f1: 5000, width: 0.9 })
  if (k > 0.5) buzz(90)
}
// Burned: a hiss and sizzle with a low whoomph.
function burn() {
  if (!limit('burn', 300) || !voice(1.6, 3)) return
  const t = now()
  burst({ t, noise: 'white', type: 'highpass', f: 3000, q: 0.5, a: 0.02, d: 1.3, gain: 0.25 })
  burst({ t, noise: 'pink', type: 'bandpass', f: 6000, q: 0.6, a: 0.05, d: 1, gain: 0.1 })
  tone({ t, f: 80, f2: 40, d: 0.5, gain: 0.4 })
  crinkle({ t, n: Math.round(26 * touch), dur: 1.2, gain: 0.04, f0: 2500, f1: 8000, width: 0.7 })
  buzz([0, 100, 50, 100])
}
function geyser(d = 20) {
  if (!limit('geyser', 300) || !voice(1.2, 1)) return
  const k = Math.max(0.1, near(d, 18))
  const t = now()
  burst({ t, noise: 'pink', type: 'bandpass', f: 600, f2: 1800, q: 0.7, a: 0.08, d: 1.1, gain: 0.25 * k })
  tone({ t, f: 70, f2: 50, d: 0.6, gain: 0.25 * k })
}
function eruption() {
  if (!limit('erupt', 2000) || !voice(3, 2)) return
  const t = now()
  tone({ t, f: 40, f2: 22, glide: 2, d: 2.6, gain: 0.5 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 220, q: 0.6, a: 0.2, d: 2.6, gain: 0.5, verb: 0.6 })
  burst({ t: t + 0.1, noise: 'pink', type: 'lowpass', f: 900, q: 0.5, a: 0.3, d: 2.2, gain: 0.12, verb: 0.6 })
}
// Arriving in a new world: a rising chord.
function worldArrive() {
  if (!limit('arrive', 800) || !voice(1.6, 3)) return
  const t = now()
  for (const [i, n] of [0, 4, 7, 12].entries()) modal({ t: t + i * 0.08, f: 523.25 * Math.pow(2, n / 12), modes: [[1, 1, 1.2], [2.756, 0.3, 0.4]], gain: 0.12, strike: 0.1, pan: (i - 1.5) * 0.25, verb: 0.4 })
}

// --- Looping world beds ---------------------------------------------------------------------------
const beds = { w2: null, w3: null }
let want = 'w1'
onStart((ctx) => {
  const mk = (v) => {
    const g = ctx.createGain()
    g.gain.value = v
    return g
  }
  const loop = (buf) => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.start(0, Math.random() * (buf.duration - 0.1))
    return src
  }
  const filt = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = q
    return b
  }
  // jungle: a high insect shimmer (amplitude-pulsed band of noise) + the river's rush
  const jungle = mk(0)
  jungle.connect(A.amb)
  const insects = mk(0.25)
  const pulse = ctx.createOscillator()
  pulse.frequency.value = 23
  const pd = mk(0.5)
  pulse.connect(pd).connect(insects.gain)
  pulse.start()
  loop(A.noise.pinkStereo).connect(filt('bandpass', 5200, 6)).connect(mk(2.2)).connect(insects).connect(jungle)
  loop(A.noise.pinkStereo).connect(filt('lowpass', 900, 0.5)).connect(mk(0.45)).connect(jungle)
  beds.w2 = jungle
  // volcano: a deep rumble and a crackling hiss
  const lava = mk(0)
  lava.connect(A.amb)
  loop(A.noise.brownStereo).connect(filt('lowpass', 90, 0.8)).connect(mk(2.4)).connect(lava)
  const crackle = mk(0.08)
  loop(A.noise.pinkStereo).connect(filt('highpass', 2500, 0.6)).connect(crackle).connect(lava)
  const wob = ctx.createOscillator()
  wob.frequency.value = 0.7
  const wd = mk(0.06)
  wob.connect(wd).connect(crackle.gain)
  wob.start()
  beds.w3 = lava
  applyBed()
})
function applyBed() {
  if (!A.ctx || !ready()) return
  const t = A.ctx.currentTime
  beds.w2?.gain.setTargetAtTime(want === 'w2' ? 0.55 : 0, t, 0.6)
  beds.w3?.gain.setTargetAtTime(want === 'w3' ? 0.6 : 0, t, 0.6)
}
export function setWorldBed(id) {
  want = id
  try {
    applyBed()
  } catch {
    // audio not running
  }
}
setInterval(() => {
  try {
    applyBed()
  } catch {
    // ignore
  }
}, 2000)

const raw = { rampLaunch, splash, chomp, whack, logSwoosh, bridgeCrack, bridgeCollapse, meteorFall, meteorImpact, burn, geyser, eruption, worldArrive }
export const worldSfx = {}
for (const [name, fn] of Object.entries(raw)) {
  worldSfx[name] = (...args) => {
    try {
      if (A.ctx && A.master) fn(...args)
    } catch (e) {
      console.warn('[audio]', name, e)
    }
  }
}
