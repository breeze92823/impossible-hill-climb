// Every one-shot sound in the game, synthesised from physical recipes (synth.js),
// cartoon-flavoured: bright glockenspiel, coins, rubbery pops, brassy fanfares.
// Nothing here throws or plays before the first gesture: each sound returns
// quietly when audio isn't running or the voice budget is spent, and the
// exported `sfx` object wraps every call in a try/catch.
//
// Materials are mode tables [ratio, amplitude, decay s]: a coin is a thin metal
// plate, the glockenspiel a free bar (2.756 is the real bar overtone), wood and
// plastic die in tens of ms, stone is dull and inharmonic.
import { COARSE_POINTER } from '../config.js'
import { A, isMuted, now, voice } from './core.js'
import { blip } from './engine.js'
import { bubble, bubbles, burst, crinkle, env, modal, pick, rnd, route, saturation, tone, vary } from './synth.js'

const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const BELL = [[0.5, 0.3, 1.5], [1, 1, 1.3], [1.19, 0.45, 1], [1.5, 0.3, 0.85], [2, 0.42, 0.75], [2.5, 0.18, 0.5], [2.66, 0.22, 0.45], [3.01, 0.1, 0.35], [4.1, 0.06, 0.25]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
const PLASTIC = [[1, 1, 0.026], [2.31, 0.5, 0.016], [3.93, 0.28, 0.01]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]
const STONE = [[1, 1, 0.06], [1.83, 0.6, 0.04], [2.71, 0.4, 0.03], [3.9, 0.25, 0.02], [5.3, 0.12, 0.012]]
const METAL = [[1, 1, 0.22], [2.4, 0.5, 0.14], [3.9, 0.3, 0.09], [5.6, 0.15, 0.05]]

const semi = (n) => Math.pow(2, n / 12)
const C6 = 1046.5
const C4 = 261.63
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const touch = COARSE_POINTER ? 0.6 : 1 // fewer grains on phones

// --- Bookkeeping -----------------------------------------------------------------------------
const lastAt = new Map()
// false if `name` played less than `ms` ago (keeps rapid repeats from stacking).
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
// Phone haptics for the big moments (Android; iOS ignores it).
function buzz(pattern) {
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not allowed in this frame.
  }
}
// Distance (m) -> 0..1 level for world one-shots, with a floor so far ones still read.
const near = (d, half = 25) => 1 / (1 + Math.pow(Math.max(0, Number(d) || 0) / half, 2))

// Glockenspiel notes (semitones above C6), `gap` s apart, panned across.
function glock(t, notes, gap, gain = 0.14, verb = 0.25, bus = A.sfx) {
  notes.forEach((n, i) => modal({ t: t + i * gap, f: C6 * semi(n), modes: GLOCK, gain: gain * rnd(0.85, 1), strike: 0.12, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb, bus }))
}

// Coins tumbling: n clinks of random small coins over `spread` s, fading out, plus the rattle.
function coins(t, n, spread, gain, pan = 0, bus = A.sfx) {
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(i / n, 1.3) * spread + rnd(0, 0.02)
    modal({ t: at, f: rnd(2500, 4400), modes: COIN, gain: gain * (1 - (i / n) * 0.7), beat: i < 4 ? 7 : 0, strike: 0.25, decay: rnd(0.5, 1), pan: pan + rnd(-0.35, 0.35), bus, verb: 0.08 })
  }
  crinkle({ t: t + spread * 0.4, n: Math.round(10 * touch), dur: spread, gain: 0.03, f0: 4000, f1: 9000, bus })
}

// Cartoon brass: two detuned saws, a filter that "blats" open on the attack, a little vibrato on
// long notes. f Hz, len s.
function brass(t, f, len, gain = 0.1, pan = 0, bus = A.sfx) {
  const ctx = A.ctx
  const out = ctx.createGain()
  out.gain.value = 0
  env(out.gain, t, 0.02, gain, 0.12, Math.max(0, len - 0.1))
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 2
  lp.frequency.setValueAtTime(f * 1.2, t)
  lp.frequency.exponentialRampToValueAtTime(f * 6, t + 0.04)
  lp.frequency.exponentialRampToValueAtTime(f * 3.2, t + 0.04 + len * 0.6)
  lp.connect(out)
  route(out, { bus, pan, verb: 0.3 })
  const end = t + len + 0.15
  const vib = ctx.createOscillator()
  vib.frequency.value = 5.5
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.linearRampToValueAtTime(len > 0.3 ? f * 0.012 : 0, t + Math.max(0.05, len))
  vib.connect(vibDepth)
  vib.start(t)
  vib.stop(end)
  for (const cents of [-7, 6]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f * 0.97, t) // lips slide up to the note
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03)
    o.detune.value = cents
    vibDepth.connect(o.frequency)
    o.connect(lp)
    o.start(t)
    o.stop(end)
  }
  return end
}

// Whoosh past: band-passed pink sweeping f -> f2.
function whoosh(t, f, f2, d, gain, bus = A.sfx, verb = 0) {
  burst({ t, noise: 'pink', f, f2, q: 0.9, a: d * 0.35, d: d * 0.65, gain, bus, verb })
}

// Sparkle: a scatter of tiny glass pings.
function sparkle(t, n, dur, gain = 0.03, f0 = 3000, f1 = 7000, bus = A.sfx) {
  for (let i = 0; i < Math.round(n * touch); i++) modal({ t: t + Math.random() * dur, f: rnd(f0, f1), modes: GLASS, gain, decay: 0.5, pan: rnd(-0.7, 0.7), bus, verb: 0.2 })
}

// =============================================================================================
// UI
// =============================================================================================

// HUD button: a short plastic press with a felt-y body thump.
function click(pan = 0) {
  if (!limit('click', 30) || !voice(0.1, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(4200, 0.1), q: 1.2, d: 0.006, gain: 0.2, bus, pan })
  modal({ t, f: vary(1250, 0.06), modes: PLASTIC, gain: 0.16, bus, pan })
  tone({ t, f: vary(170, 0.05), f2: 85, d: 0.04, gain: 0.22, bus, pan })
}

// Panel opens: air pushed aside, a bubbly pop as the card lands.
function open() {
  if (!limit('panel', 90) || !voice(0.35, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, noise: 'pink', f: 320, f2: 2400, q: 0.9, a: 0.07, d: 0.15, gain: 0.26, bus })
  bubble({ t: t + 0.08, f: vary(380, 0.06), d: 0.07, gain: 0.2, rise: 1.2, bus })
  tone({ t: t + 0.09, f: 125, f2: 70, d: 0.08, gain: 0.18, bus })
}
function close() {
  if (!limit('panel', 90) || !voice(0.2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 2100, f2: 300, q: 0.9, a: 0.02, d: 0.13, gain: 0.3, bus: A.ui })
  bubble({ t, f: vary(700, 0.06), d: 0.05, gain: 0.12, rise: -0.4, bus: A.ui })
}

// Soft "nope": a dull wooden knock and a two-note cartoon "uh-uh" going down.
function error() {
  if (!limit('error', 160) || !voice(0.35, 2)) return
  const t = now()
  const bus = A.ui
  modal({ t, f: vary(210, 0.03), modes: WOOD, gain: 0.32, strike: 0.12, bus })
  const f = vary(330, 0.03)
  tone({ t, type: 'triangle', f, f2: f * 0.97, a: 0.01, hold: 0.05, d: 0.06, gain: 0.14, bus, lp: 1200 })
  tone({ t: t + 0.13, type: 'triangle', f: f * 0.75, f2: f * 0.7, a: 0.01, hold: 0.07, d: 0.1, gain: 0.14, bus, lp: 1000 })
  buzz(30)
}

// Small reward: the classic two-step coin, a little sparkle.
function coin() {
  if (!limit('coin', 60) || !voice(0.6, 2)) return
  const t = now()
  const f = vary(1975, 0.03) // ~B6
  modal({ t, f, modes: COIN, gain: 0.12, beat: 6, strike: 0.25, decay: 0.5, verb: 0.08 })
  modal({ t: t + 0.07, f: f * semi(5), modes: COIN, gain: 0.14, beat: 6, strike: 0.2, decay: 0.9, verb: 0.12 })
  sparkle(t + 0.08, 3, 0.15, 0.02)
}

// Cave win pad: a whoosh up, a rising arpeggio, coins pouring out; bigger n = longer run, more coins,
// a bass boom and a shimmer on top.
function winClaim(n = 1) {
  if (!limit('win', 150) || !voice(1.8, 3)) return
  const t = now()
  const k = clamp01(Math.log10(Math.max(1, Number(n) || 1) + 1) / 2.5) // 1 -> 0.12, 10 -> 0.42, 250 -> 0.96
  whoosh(t, 400, 2800, 0.22, 0.14)
  const run = [0, 4, 7, 12, 16, 19, 24, 28].slice(0, 3 + Math.round(k * 5))
  glock(t + 0.05, run, 0.055 - k * 0.012, 0.14, 0.3)
  coins(t + 0.1, Math.round((6 + k * 16) * touch), 0.35 + k * 0.5, 0.09)
  if (k > 0.3) {
    tone({ t: t + 0.05, f: 90, f2: 45, d: 0.4, gain: 0.25 * k })
    modal({ t: t + 0.05 + run.length * 0.05, f: C6 * semi(24), modes: BELL, gain: 0.08 * k, beat: 4, verb: 0.35 })
  }
  if (k > 0.6) sparkle(t + 0.2, 10, 0.8, 0.025)
  buzz(k > 0.5 ? [30, 40, 50] : 25)
}

// Training "+216" popup: a soft, tiny bubble pop with a breath of air. Plays ~1/s, so it is quiet
// and walks a pentatonic set so it never sounds like the same sample.
const TICK_NOTES = [0, 2, 4, 7, 9]
let tickStep = 0
function speedTick() {
  if (!limit('speedTick', 220) || !voice(0.12, 1)) return
  const t = now()
  tickStep = (tickStep + 1 + Math.floor(Math.random() * 2)) % TICK_NOTES.length
  const f = 620 * semi(TICK_NOTES[tickStep])
  bubble({ t, f, d: 0.05, gain: 0.07, rise: 0.9, pan: rnd(-0.15, 0.15), bus: A.ui })
  burst({ t, noise: 'pink', f: 1800, f2: 3500, q: 0.8, a: 0.02, d: 0.05, gain: 0.025, bus: A.ui })
}

// Level up: a brassy "da-da-da DAAA" (G C E G), a bass hit, a cymbal swell and glock sparkles.
function levelUp() {
  if (!limit('levelUp', 600) || !voice(2.2, 4)) return
  const t = now()
  const notes = [[7, 0, 0.09], [12, 0.11, 0.09], [16, 0.22, 0.09], [19, 0.36, 0.55]]
  for (const [n, at, len] of notes) {
    brass(t + at, C4 * semi(n), len, 0.075, -0.15)
    brass(t + at, C4 * semi(n - 12), len, 0.04, 0.15) // octave below for body
  }
  tone({ t: t + 0.36, f: 98, f2: 49, d: 0.5, gain: 0.3 })
  burst({ t: t + 0.36, type: 'highpass', f: 5000, q: 0.5, a: 0.005, d: 0.9, gain: 0.1, verb: 0.3 }) // crash
  burst({ t, type: 'highpass', f: 6000, q: 0.5, a: 0.35, d: 0.05, gain: 0.05 }) // swell into it
  glock(t + 0.4, [12, 16, 19, 24], 0.05, 0.1, 0.35)
  sparkle(t + 0.45, 8, 0.7, 0.022)
  buzz([30, 40, 30, 40, 80])
}

// Bike equipped: a quick rev (pulse train through a saturated lowpass rising and falling), then a chime.
function equip() {
  if (!limit('equip', 200) || !voice(1.2, 3)) return
  const ctx = A.ctx
  const t = now()
  blip(0.6) // the player's own engine answers too
  const out = ctx.createGain()
  out.gain.value = 0
  out.gain.setValueAtTime(0.0001, t)
  out.gain.linearRampToValueAtTime(0.16, t + 0.05)
  out.gain.setValueAtTime(0.16, t + 0.35)
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.65)
  route(out, { verb: 0.15 })
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(500, t)
  lp.frequency.exponentialRampToValueAtTime(2400, t + 0.22)
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.6)
  const sh = ctx.createWaveShaper()
  sh.curve = saturation(2.5)
  sh.connect(lp).connect(out)
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  const f0 = vary(32, 0.05)
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f0 * 4.2, t + 0.22)
  o.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.6)
  const sub = ctx.createOscillator()
  sub.type = 'square'
  sub.frequency.setValueAtTime(f0 / 2, t)
  sub.frequency.exponentialRampToValueAtTime(f0 * 2.1, t + 0.22)
  sub.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.6)
  const sg = ctx.createGain()
  sg.gain.value = 0.5
  o.connect(sh)
  sub.connect(sg).connect(sh)
  for (const x of [o, sub]) {
    x.start(t)
    x.stop(t + 0.7)
  }
  burst({ t: t + 0.25, type: 'highpass', f: 2500, q: 0.6, a: 0.0004, d: 0.012, gain: 0.12 }) // a pop as it backs off
  modal({ t: t + 0.32, f: C6 * semi(7), modes: GLOCK, gain: 0.12, strike: 0.1, verb: 0.3 })
  modal({ t: t + 0.4, f: C6 * semi(12), modes: GLOCK, gain: 0.14, strike: 0.1, verb: 0.3 })
  modal({ t: t + 0.4, f: C6 * semi(16), modes: GLOCK, gain: 0.07, verb: 0.3 })
}

// Hatch: the egg rocks on the stand, knocks coming faster with a creak of shell. Cut off by the
// crack/reveal, so it fits however long the HUD shakes.
let shakeBus = null
function hatchShake(dur = 1.7) {
  if (!voice(dur, 2)) return
  const ctx = A.ctx
  const t = now()
  shakeBus = ctx.createGain()
  shakeBus.gain.value = 1
  shakeBus.connect(A.sfx)
  let at = t + 0.03
  let gap = 0.24
  let side = 1
  while (at < t + dur) {
    const k = (at - t) / dur
    modal({ t: at, f: rnd(330, 430) * (1 + k * 0.2), modes: WOOD, gain: 0.14 + k * 0.14, strike: 0.06, pan: side * 0.25, bus: shakeBus })
    burst({ t: at, f: rnd(2500, 4000), q: 2, a: 0.0005, d: 0.006, gain: 0.04 + k * 0.05, pan: side * 0.25, bus: shakeBus })
    side = -side
    at += gap * rnd(0.85, 1.15)
    gap = Math.max(0.075, gap * 0.85)
  }
  // Rising tension: a soft swell of air.
  burst({ t, noise: 'pink', f: 300, f2: 1500, q: 1.2, a: dur * 0.9, d: 0.1, gain: 0.07, bus: shakeBus })
}
function stopShake(at) {
  if (!shakeBus) return
  try {
    shakeBus.gain.setTargetAtTime(0, at, 0.02)
  } catch {
    // Already gone.
  }
  shakeBus = null
}

// Shell cracking: sharp brittle snaps and a crunchy crinkle.
function hatchCrack() {
  if (!voice(0.4, 2)) return
  const t = now()
  for (let i = 0; i < 4; i++) {
    const at = t + i * rnd(0.025, 0.06)
    burst({ t: at, f: rnd(2500, 5000), q: 2, a: 0.0005, d: 0.012, gain: 0.26 })
    modal({ t: at, f: rnd(900, 1600), modes: WOOD, gain: 0.13, decay: 0.6 })
  }
  crinkle({ t, n: Math.round(14 * touch), dur: 0.18, gain: 0.07, f0: 3000, f1: 8000 })
}

// The pet pops out: a poof, a cork pop, a run (longer for rarer), and for Legendary a brass hit,
// a bell and a shimmer.
const RANK = { Common: 0, Rare: 1, Legendary: 2 }
function hatchReveal(rarity = 'Common') {
  if (!voice(2.5, 4)) return
  const t = now()
  stopShake(t)
  const r = RANK[rarity] ?? 0
  burst({ t, noise: 'pink', f: 2500, f2: 400, q: 0.7, a: 0.004, d: 0.3, gain: 0.3, verb: 0.2 }) // poof
  bubble({ t, f: 380, d: 0.08, gain: 0.32, rise: 1.5 })
  tone({ t, f: 120, f2: 55, d: 0.15, gain: 0.3 })
  const runs = [[0, 4, 7, 12], [0, 4, 7, 12, 16, 19], [0, 4, 7, 12, 16, 19, 24, 28]]
  glock(t + 0.06, runs[r], 0.06, 0.14, 0.35)
  sparkle(t + 0.1, 4 + r * 8, 0.5 + r * 0.4, 0.025)
  if (r >= 1) coins(t + 0.15, Math.round(6 * r * touch), 0.5, 0.06)
  if (r >= 2) {
    const at = t + 0.06 + runs[r].length * 0.06
    for (const n of [0, 4, 7]) brass(at, C4 * semi(n + 12), 0.7, 0.05, (n - 4) / 8)
    tone({ t: at, f: 65, f2: 33, d: 1, gain: 0.35 })
    modal({ t: at, f: C6 * semi(12), modes: BELL, gain: 0.12, beat: 4, strike: 0.2, verb: 0.45 })
    burst({ t: at, type: 'highpass', f: 5000, q: 0.5, a: 0.005, d: 1.2, gain: 0.08, verb: 0.3 })
  }
  buzz(r >= 2 ? [40, 50, 40, 50, 90] : r ? [30, 40, 30] : 25)
}

// Spending: the till drawer clunks, the bell rings, coins pour out.
function purchase() {
  if (!limit('buy', 200) || !voice(1.4, 3)) return
  const t = now()
  burst({ t, type: 'lowpass', f: 700, q: 0.7, d: 0.1, gain: 0.3 })
  tone({ t, f: 95, f2: 52, d: 0.1, gain: 0.3 })
  modal({ t: t + 0.04, f: 1046, modes: BELL, gain: 0.18, beat: 4, strike: 0.2, verb: 0.15 })
  coins(t + 0.06, Math.round(10 * touch), 0.45, 0.085)
  buzz([20, 40, 30])
}

// Spin wheel flapper hitting a peg: plastic tick, tiny pitch variation.
function spinTick() {
  if (!limit('spinTick', 25) || !voice(0.05, 1)) return
  const t = now()
  modal({ t, f: vary(2100, 0.04), modes: PLASTIC, gain: 0.13, bus: A.ui, strike: 0.08 })
  burst({ t, f: 5000, q: 1.5, a: 0.0004, d: 0.004, gain: 0.07, bus: A.ui })
}

// Wheel stops: ding-ding, a fanfare run, coins.
function spinWin() {
  if (!limit('spinWin', 500) || !voice(1.8, 3)) return
  const t = now()
  modal({ t, f: C6 * semi(12), modes: BELL, gain: 0.12, beat: 4, strike: 0.2, verb: 0.2 })
  modal({ t: t + 0.12, f: C6 * semi(12), modes: BELL, gain: 0.12, beat: 4, strike: 0.2, verb: 0.2 })
  glock(t + 0.25, [0, 4, 7, 12, 16, 19, 24], 0.05, 0.13, 0.3)
  coins(t + 0.3, Math.round(12 * touch), 0.6, 0.08)
  buzz([30, 40, 50])
}

// Treasure chest: the lid creaks open (a slow, wobbling pulse train through a wooden formant), the
// latch clacks, a magic swell, then coins spill out.
function chest() {
  if (!limit('chest', 400) || !voice(2, 3)) return
  const ctx = A.ctx
  const t = now()
  modal({ t, f: vary(1700, 0.04), modes: METAL, gain: 0.12, strike: 0.3 }) // latch
  const creak = ctx.createOscillator()
  creak.type = 'sawtooth'
  creak.frequency.setValueAtTime(rnd(28, 36), t + 0.05)
  creak.frequency.linearRampToValueAtTime(rnd(55, 75), t + 0.3)
  creak.frequency.linearRampToValueAtTime(rnd(40, 50), t + 0.5)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = rnd(800, 1100)
  bp.Q.value = 3
  const cg = ctx.createGain()
  cg.gain.value = 0
  env(cg.gain, t + 0.05, 0.08, 0.35, 0.37, 0.05)
  creak.connect(bp).connect(cg)
  route(cg, { verb: 0.15 })
  creak.start(t + 0.05)
  creak.stop(t + 0.65)
  tone({ t: t + 0.5, f: 130, f2: 70, d: 0.1, gain: 0.25 }) // lid hits the stop
  modal({ t: t + 0.5, f: 300, modes: WOOD, gain: 0.25, strike: 0.1 })
  burst({ t: t + 0.4, noise: 'pink', f: 400, f2: 3000, q: 1, a: 0.2, d: 0.3, gain: 0.12 })
  glock(t + 0.55, [0, 7, 12, 16, 19, 24], 0.06, 0.12, 0.35)
  coins(t + 0.6, Math.round(16 * touch), 0.8, 0.09)
  sparkle(t + 0.6, 8, 0.8, 0.02)
  buzz([30, 50, 40])
}

// Teleport (back to the lobby): a rising whoosh, a sine zipping up, sparkles, a pop at the end.
function teleport() {
  if (!limit('tp', 400) || !voice(1.2, 3)) return
  const t = now()
  whoosh(t, 300, 4000, 0.5, 0.25, A.sfx, 0.2)
  tone({ t, f: 300, f2: 1800, glide: 0.45, a: 0.05, d: 0.45, gain: 0.07, verb: 0.3 })
  tone({ t, type: 'triangle', f: 600, f2: 3600, glide: 0.45, a: 0.05, d: 0.45, gain: 0.03, detune: 8, verb: 0.3 })
  sparkle(t + 0.1, 10, 0.5, 0.025, 3500, 8000)
  bubble({ t: t + 0.5, f: 500, d: 0.07, gain: 0.28, rise: 1.4 })
  glock(t + 0.52, [12, 19, 24], 0.05, 0.08, 0.4)
}

// =============================================================================================
// The hill
// =============================================================================================

// A boulder breaks loose up top: a far-off crack echoing off the cliffs, then the grind of it
// starting to roll.
function boulderSpawn() {
  if (!limit('bSpawn', 300) || !voice(2, 2)) return
  const t = now()
  const pan = rnd(-0.3, 0.3)
  const bus = A.boulder
  burst({ t, type: 'lowpass', f: 2500, q: 0.6, a: 0.0008, d: 0.08, gain: 0.35, pan, bus, verb: 0.9 })
  modal({ t, f: rnd(300, 420), modes: STONE, gain: 0.3, strike: 0.2, pan, bus, verb: 0.8 })
  tone({ t, f: 70, f2: 40, d: 0.5, gain: 0.25, pan, bus, verb: 0.5 })
  burst({ t: t + 0.15, noise: 'brown', type: 'lowpass', f: 200, f2: 450, q: 0.6, a: 0.6, d: 0.9, gain: 0.35, pan, bus, verb: 0.5 })
  crinkle({ t: t + 0.1, n: Math.round(14 * touch), dur: 0.9, gain: 0.03, f0: 800, f1: 3000, width: 0.3, bus, verb: 0.5 })
}

// A boulder slams into the bottom: a huge low thud, a dust burst, gravel scattering.
function boulderImpact(distance = 20) {
  if (!voice(1.5, 3)) return
  const t = now()
  const k = Math.max(0.12, near(distance, 30))
  const bus = A.boulder
  const verb = 0.2 + 0.6 * (1 - k)
  tone({ t, f: vary(62, 0.05), f2: 26, glide: 0.5, d: 0.9, gain: 0.6 * k, bus })
  burst({ t, noise: 'brown', type: 'lowpass', f: 250 + 900 * k, q: 0.7, a: 0.003, d: 0.7, gain: 0.55 * k, bus, verb })
  burst({ t, type: 'lowpass', f: 1500 + 4000 * k, q: 0.6, a: 0.001, d: 0.05, gain: 0.3 * k, bus, verb })
  burst({ t: t + 0.03, noise: 'pink', type: 'highpass', f: 1500, q: 0.5, a: 0.05, d: 0.8, gain: 0.08 * k, bus, verb }) // dust
  for (let i = 0; i < Math.round(10 * touch); i++) {
    modal({ t: t + 0.05 + Math.pow(Math.random(), 1.5) * 0.7, f: rnd(500, 1800), modes: STONE, gain: rnd(0.04, 0.1) * k, pan: rnd(-0.7, 0.7), bus, verb })
  }
  if (k > 0.4) buzz(60)
}

// A boulder bursts into rocks: a sharp crack, a crumbling roar, then pieces bouncing away (each
// a stone knock, the small ones higher, some bouncing twice).
function boulderShatter(distance = 20) {
  if (!voice(2, 3)) return
  const t = now()
  const k = Math.max(0.12, near(distance, 30))
  const bus = A.boulder
  const verb = 0.2 + 0.6 * (1 - k)
  burst({ t, type: 'highpass', f: 1200, q: 0.6, a: 0.0006, d: 0.04, gain: 0.45 * k, bus, verb })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, q: 0.6, a: 0.003, d: 0.6, gain: 0.5 * k, bus, verb })
  tone({ t, f: 85, f2: 35, d: 0.45, gain: 0.45 * k, bus })
  burst({ t: t + 0.02, noise: 'pink', f: 1500, f2: 500, q: 0.7, a: 0.01, d: 0.5, gain: 0.2 * k, bus, verb }) // crumble
  const pieces = Math.round(18 * touch)
  for (let i = 0; i < pieces; i++) {
    const big = Math.random() < 0.3
    const f = big ? rnd(250, 500) : rnd(600, 2200)
    const at = t + 0.04 + Math.pow(Math.random(), 1.4) * 0.8
    const pan = rnd(-0.8, 0.8)
    const g = (big ? 0.14 : 0.07) * k * rnd(0.5, 1)
    modal({ t: at, f, modes: STONE, gain: g, strike: 0.15, pan, bus, verb })
    if (Math.random() < 0.5) modal({ t: at + rnd(0.12, 0.3), f: f * rnd(0.95, 1.05), modes: STONE, gain: g * 0.45, pan: pan * 1.1, bus, verb })
  }
  crinkle({ t: t + 0.05, n: Math.round(20 * touch), dur: 0.7, gain: 0.04 * k, f0: 1500, f1: 6000, width: 0.8, bus })
}

// SQUASHED. The big one: a deep slam, a crunch of crackers and cardboard, a wet cartoon SPLAT with
// squelchy bubbles, then (randomly ordered/varied) a rubber-toy squeak and a spring "boing".
function squeak(t, gain = 0.12, bus = A.sfx) {
  const ctx = A.ctx
  const o = ctx.createOscillator()
  o.type = 'triangle'
  const f = rnd(900, 1250)
  o.frequency.setValueAtTime(f * 0.8, t)
  o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.07)
  o.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.2)
  const vib = ctx.createOscillator()
  vib.frequency.value = rnd(28, 40)
  const vd = ctx.createGain()
  vd.gain.value = f * 0.06
  vib.connect(vd).connect(o.frequency)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = f * 1.6
  bp.Q.value = 1.2
  const g = ctx.createGain()
  env(g.gain, t, 0.015, gain, 0.2, 0.03)
  o.connect(bp).connect(g)
  route(g, { bus, pan: rnd(-0.2, 0.2), verb: 0.15 })
  for (const x of [o, vib]) {
    x.start(t)
    x.stop(t + 0.3)
  }
}
function boing(t, gain = 0.18, bus = A.sfx) {
  const ctx = A.ctx
  const o = ctx.createOscillator()
  const f = rnd(140, 190)
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.5)
  const vib = ctx.createOscillator()
  vib.frequency.setValueAtTime(14, t)
  vib.frequency.linearRampToValueAtTime(9, t + 0.6)
  const vd = ctx.createGain()
  vd.gain.setValueAtTime(f * 0.45, t)
  vd.gain.exponentialRampToValueAtTime(f * 0.02, t + 0.6)
  vib.connect(vd).connect(o.frequency)
  const g = ctx.createGain()
  env(g.gain, t, 0.005, gain, 0.6)
  o.connect(g)
  route(g, { bus, verb: 0.2 })
  for (const x of [o, vib]) {
    x.start(t)
    x.stop(t + 0.7)
  }
}
// distance (m, optional): 0 / omitted = the player; an NPC flattened further away is quieter,
// duller and echoier.
function crush(distance = 0) {
  const d = Math.max(0, Number(distance) || 0)
  // The player's own splat never waits behind an NPC's.
  if (!limit(d > 0 ? 'crushFar' : 'crush', 400) || !voice(2, d > 0 ? 2 : 6)) return
  const ctx = A.ctx
  const t = now()
  const k = d > 0 ? Math.max(0.08, near(d, 18)) : 1
  // Everything goes through one level + air filter so a far splat is the same splat, further away.
  const bus = ctx.createGain()
  bus.gain.value = k
  const air = ctx.createBiquadFilter()
  air.type = 'lowpass'
  air.frequency.value = 1200 + 18000 * k
  air.connect(bus)
  route(bus, { verb: 0.6 * (1 - k) })
  const stop = t + 2.5
  setTimeout(() => {
    try {
      bus.disconnect()
    } catch {
      // gone
    }
  }, (stop - A.ctx.currentTime) * 1000 + 100)
  const o = { bus: air }
  // Slam.
  tone({ t, f: vary(80, 0.06), f2: 28, glide: 0.4, d: 0.7, gain: 0.7, ...o })
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, q: 0.7, a: 0.002, d: 0.45, gain: 0.6, verb: 0.3 * k, ...o })
  burst({ t, type: 'highpass', f: 2000, q: 0.5, a: 0.0005, d: 0.03, gain: 0.35, ...o })
  // Crunch: a dense burst of brittle grains.
  crinkle({ t, n: Math.round(36 * touch * (0.5 + 0.5 * k)), dur: 0.14, gain: 0.16, f0: 700, f1: 4500, width: 0.6, ...o })
  for (let i = 0; i < 5; i++) modal({ t: t + rnd(0, 0.1), f: rnd(500, 1300), modes: WOOD, gain: rnd(0.08, 0.15), strike: 0.2, pan: rnd(-0.5, 0.5), ...o })
  // SPLAT: a wet, mid-heavy slap sweeping down, with squelchy low bubbles.
  burst({ t: t + 0.01, noise: 'pink', f: 2200, f2: 350, sweep: 0.12, q: 1.3, a: 0.003, d: 0.22, gain: 0.5, verb: 0.15 * k, ...o })
  burst({ t: t + 0.01, noise: 'pink', type: 'lowpass', f: 900, q: 1, a: 0.002, d: 0.1, gain: 0.4, ...o })
  bubbles({ t: t + 0.03, n: Math.round(14 * touch), dur: 0.3, f0: 140, f1: 650, gain: 0.14, d: [0.03, 0.08], rise: 0.6, width: 0.5, ...o })
  // Comedy tag, randomly ordered and varied.
  const at = t + rnd(0.32, 0.42)
  if (Math.random() < 0.5) {
    squeak(at, 0.12, air)
    if (Math.random() < 0.6) boing(at + 0.22, 0.14, air)
  } else {
    boing(at, 0.18, air)
    if (Math.random() < 0.6) squeak(at + 0.35, 0.1, air)
  }
  if (k > 0.6) buzz([0, 120, 60, 40])
}

// Respawn: a cork pop and a little twinkle.
function respawn() {
  if (!limit('respawn', 300) || !voice(0.6, 2)) return
  const t = now()
  bubble({ t, f: vary(420, 0.06), d: 0.07, gain: 0.3, rise: 1.4 })
  burst({ t, f: 2600, q: 1, d: 0.01, gain: 0.12 })
  burst({ t, noise: 'pink', f: 3000, f2: 600, q: 0.9, a: 0.01, d: 0.15, gain: 0.1 })
  glock(t + 0.06, pick([[12, 19], [7, 12], [12, 16]]), 0.06, 0.08, 0.35)
}

// Into a safe cave: a short whoosh with a big echoing tail, a warm hum and a soft chime that
// repeats off the walls.
function caveEnter() {
  if (!limit('cave', 800) || !voice(1.6, 2)) return
  const t = now()
  whoosh(t, 1800, 300, 0.35, 0.22, A.sfx, 0.9)
  tone({ t, f: 110, a: 0.15, d: 0.7, gain: 0.08, verb: 0.6 })
  tone({ t, f: 165, a: 0.15, d: 0.6, gain: 0.04, verb: 0.6 })
  const f = C6 * semi(pick([7, 12]))
  for (let i = 0; i < 4; i++) modal({ t: t + 0.12 + i * 0.16, f, modes: GLOCK, gain: 0.1 * Math.pow(0.45, i), pan: i % 2 ? 0.4 : -0.4, verb: 0.6 })
}

// Hop: a springy "bwip" rising and a breath of air; the engine blips.
function jump() {
  if (!limit('jump', 150) || !voice(0.25, 1)) return
  const t = now()
  blip(0.4)
  tone({ t, type: 'triangle', f: vary(220, 0.06), f2: 560, glide: 0.1, d: 0.12, gain: 0.06, lp: 2500 })
  burst({ t, noise: 'pink', f: 450, f2: 1400, q: 0.9, a: 0.03, d: 0.1, gain: 0.1 })
}

// Landing (strength 0..1): suspension thud, a metal clunk from the forks, grit kicking up.
function land(strength = 0.5) {
  if (!limit('land', 120) || !voice(0.4, 1)) return
  const t = now()
  const k = Math.max(0.2, Math.min(1, Number(strength) || 0))
  tone({ t, f: vary(85, 0.06), f2: 45, d: 0.12, gain: 0.4 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, a: 0.003, d: 0.13, gain: 0.35 * k })
  if (k > 0.35) modal({ t: t + 0.01, f: vary(520, 0.05), modes: METAL, gain: 0.05 * k, decay: 0.5, strike: 0.2 })
  crinkle({ t: t + 0.02, n: Math.round(4 + 8 * k), dur: 0.2, gain: 0.03 * k, f0: 2000, f1: 7000 })
}

// Stepping onto a treadmill: a relay clack, the motor whine spooling up, the belt thumping into
// motion.
function treadmillStart() {
  if (!limit('tread', 500) || !voice(0.9, 2)) return
  const t = now()
  modal({ t, f: vary(1400, 0.03), modes: PLASTIC, gain: 0.16, strike: 0.15 })
  tone({ t, type: 'sawtooth', f: 120, f2: 620, glide: 0.5, a: 0.05, hold: 0.2, d: 0.3, gain: 0.035, lp: 1800 })
  tone({ t, f: 60, f2: 110, glide: 0.5, a: 0.05, hold: 0.2, d: 0.3, gain: 0.12 })
  for (let i = 0; i < 4; i++) tone({ t: t + 0.1 + i * (0.16 - i * 0.025), f: 90, f2: 55, d: 0.05, gain: 0.12 })
  glock(t + 0.15, [12], 0, 0.05, 0.3)
}

// Every export wrapped: a sound must never take the game down.
const raw = {
  click, open, close, error, coin, winClaim, speedTick, levelUp, equip,
  hatchShake, hatchCrack, hatchReveal, purchase, spinTick, spinWin, chest, teleport,
  boulderSpawn, boulderImpact, boulderShatter, crush, respawn, caveEnter, jump, land, treadmillStart,
}
export const sfx = {}
for (const [name, fn] of Object.entries(raw)) {
  sfx[name] = (...args) => {
    try {
      if (A.ctx && A.master) fn(...args)
    } catch (e) {
      console.warn('[audio]', name, e)
    }
  }
}
