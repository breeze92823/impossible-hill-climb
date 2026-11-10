// Background music, composed live (no files, never the same twice, never a loop seam).
// Warm, acoustic-feeling instruments only, everything under a soft ~3 kHz ceiling so
// nothing hisses, beeps or fatigues the ear over a long session:
//  - pad:    detuned triangle + saw through a slow-breathing lowpass (a soft string bed)
//  - bass:   round sine with a little lowpassed triangle body
//  - keys:   felt-mallet melody (sine + quiet 2nd/4th partials, like a marimba with soft
//            mallets) with a dark dotted-eighth echo and the shared reverb
//  - pluck:  a muted harp-like arpeggio (triangle, filter closes as it rings)
//  - drums:  soft kick, hand drums, brushed snare, a gentle shaker; no hats, no cymbals
// Composition: a major key, one chord per bar from loved progressions with 7th / add9
// colour; the melody is a 2-bar motif stated, repeated, varied, then answered (that
// repetition is what makes it hum-able), always landing on chord tones on the strong
// beats and on the major pentatonic in between. Songs are 4 sections of 8 bars
// (A, A, B, B with a breather), then a new key, new progressions and new motifs.
// Energy follows the game: relaxed in the lobby, layers join as the player climbs
// (setAltitude), changing only at bar lines and by a little per bar.
import { AUDIO, COARSE_POINTER } from '../config.js'
import { A, isMuted, onStart, ready } from './core.js'
import { burst, rnd, route, tone } from './synth.js'

const M = AUDIO.music
const L = M.layers
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const PENTA = new Set([0, 1, 2, 4, 5]) // scale degrees of the major pentatonic
// Extra colour per chord (scale steps above its root): add9 on I and V, 7ths elsewhere.
const COLOR = { 0: [0, 2, 4, 8], 1: [0, 2, 4, 6], 2: [0, 2, 4, 6], 3: [0, 2, 4, 6], 4: [0, 2, 4, 8], 5: [0, 2, 4, 6] }
// One chord (scale degree, 0 = I) per bar.
const PROGS = [
  [0, 4, 5, 3, 0, 4, 3, 3], // I V vi IV
  [5, 3, 0, 4, 5, 3, 0, 4], // vi IV I V
  [3, 0, 4, 5, 3, 0, 1, 4], // IV I V vi, IV I ii V
  [0, 2, 3, 0, 5, 1, 3, 4], // I iii IV I, vi ii IV V
  [0, 3, 0, 4, 5, 3, 1, 4], // I IV I V, vi IV ii V
  [3, 4, 2, 5, 1, 4, 0, 0], // IV V iii vi, ii V I
]
const KEYS = [62, 67, 60, 65, 64] // D, G, C, F, E
// Arpeggio orders over the chord tones (indexes into the sorted chord, 8 eighths a bar).
const ARPS = [
  [0, 1, 2, 1, 3, 1, 2, 1],
  [0, 2, 1, 2, 3, 2, 1, 2],
  [0, 1, 2, 3, 2, 1, 2, 1],
  [0, 2, 3, 2, 1, 2, 3, 1],
]
// Bass patterns by energy: [slot (eighth), length (eighths), semitones above the root].
const BASS = [
  [[0, 6, 0], [6, 2, 7]],
  [[0, 3, 0], [3, 1, 0], [4, 3, 0], [7, 1, 7]],
  [[0, 2, 0], [2, 1, 12], [3, 1, 0], [4, 2, 0], [6, 1, 7], [7, 1, 12]],
]
// Melody onset odds per eighth over a 2-bar motif: downbeats likely, the end of the
// second bar mostly empty so the phrase breathes.
const ONSET = [0.95, 0.12, 0.5, 0.32, 0.7, 0.18, 0.45, 0.25, 0.65, 0.14, 0.45, 0.3, 0.5, 0.1, 0.06, 0]
const STEPS = [1, 1, 1, 2, 2, -1, -1, 0, 3, -2]

const mtof = (m) => 440 * 2 ** ((m - 69) / 12)
const mod = (n, m) => ((n % m) + m) % m
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const clamp01 = (x) => Math.max(0, Math.min(1, x))

const s = {
  ok: false,
  on: true,
  inp: null, // every layer feeds this
  out: null, // on/off + fade in
  echo: null, // melody echo send
  alt: 0,
  energy: M.lobbyEnergy,
  target: M.lobbyEnergy,
  next: 0, // ctx time of the next eighth
  resync: true,
  slot: 0, // eighth in the bar
  bar: 0, // bar in the section
  section: -1,
  key: KEYS[0],
  lo: 0, // melody range as scale indexes
  hi: 0,
  progA: PROGS[0],
  progB: PROGS[1],
  prog: PROGS[0],
  motifA: null,
  motifB: null,
  phrase: [], // the four 2-bar units of this section
  pos: 4, // melody scale index
  deg: 0, // chord now
  padNotes: [],
  arpNotes: [],
  arp: ARPS[0],
  bass: BASS[0],
  breath: false,
}
try {
  s.on = localStorage.getItem(M.storageKey) !== 'off'
} catch {
  // Storage blocked: music on.
}

const eighth = () => 30 / M.bpm

// --- Key and harmony ---------------------------------------------------------------------
const melRoot = () => 55 + mod(s.key - 55, 12) // melody tonic, G3..F#4
const idxMidi = (i) => melRoot() + 12 * Math.floor(i / 7) + MAJOR[mod(i, 7)]
const isChordTone = (i, deg) => {
  const d = mod(i - deg, 7)
  return d === 0 || d === 2 || d === 4
}
function nearestChordTone(i, deg, rootOnly = false) {
  for (let r = 0; r < 7; r++) {
    for (const c of [i - r, i + r]) {
      if (c < s.lo || c > s.hi) continue
      if (rootOnly ? mod(c - deg, 7) === 0 : isChordTone(c, deg)) return c
    }
  }
  return i
}
function setKey(key) {
  s.key = key
  s.lo = 0
  while (idxMidi(s.lo) < 60) s.lo++
  s.hi = s.lo
  while (idxMidi(s.hi + 1) <= 81) s.hi++ // melody never above A5 (880 Hz)
  s.pos = Math.max(s.lo, Math.min(s.hi, s.lo + 3))
}
// Pitch classes of chord `deg` in the current key (with its colour note).
const chordPcs = (deg) => COLOR[deg].map((st) => mod(s.key + MAJOR[mod(deg + st, 7)] + 12 * Math.floor((deg + st) / 7), 12))
// Place pitch classes in [lo, lo+12), sorted, nudging any semitone clash up an octave.
function voice(pcs, lo) {
  const notes = pcs.map((pc) => lo + mod(pc - lo, 12)).sort((a, b) => a - b)
  for (let i = 1; i < notes.length; i++) if (notes[i] - notes[i - 1] < 2) notes[i] += 12
  return notes.sort((a, b) => a - b)
}

// --- Motifs ----------------------------------------------------------------------------------
// A 2-bar phrase: 16 eighth slots, each null or { step (scale steps from the previous
// note), len (eighths), v (velocity), root (land on the chord root) }.
function makeMotif(density, answer = false) {
  let slots = []
  for (let i = 0; i < 16; i++) if (Math.random() < Math.min(1, ONSET[i] * density)) slots.push(i)
  if (answer) slots = slots.filter((i) => i < 9)
  for (const must of [0, 4, 8]) if (slots.length < 3 && !slots.includes(must)) slots.push(must)
  if (!slots.includes(0)) slots.push(0)
  slots = [...new Set(slots)].sort((a, b) => a - b)
  const notes = new Array(16).fill(null)
  slots.forEach((sl, k) => {
    const next = slots[k + 1] ?? (answer ? sl + 8 : 16)
    let step = k === 0 ? 0 : pick(STEPS)
    // An arch: mostly rising through the first half, falling back after.
    if (Math.random() < 0.75) step = k < slots.length / 2 ? Math.abs(step) : -Math.abs(step)
    notes[sl] = { step, len: Math.min(answer && k === slots.length - 1 ? 8 : 4, next - sl), v: sl % 4 === 0 ? 1 : rnd(0.68, 0.85) }
  })
  if (answer) notes[slots[slots.length - 1]].root = true // the answer comes home
  return notes
}
// The same motif with a couple of notes bent, maybe one dropped or one added.
function vary(motif) {
  const m = motif.map((n) => (n ? { ...n } : null))
  const used = m.map((n, i) => (n ? i : -1)).filter((i) => i > 0)
  for (let k = 0; k < 2 && used.length; k++) {
    const n = m[pick(used)]
    n.step += Math.random() < 0.5 ? -1 : 1
  }
  if (used.length > 3 && Math.random() < 0.3) m[pick(used)] = null
  if (Math.random() < 0.35) {
    const free = [2, 3, 6, 10, 11].filter((i) => !m[i])
    if (free.length) m[pick(free)] = { step: Math.random() < 0.5 ? 1 : -1, len: 1, v: 0.7 }
  }
  // Re-measure lengths after the edits.
  let last = -1
  for (let i = 0; i < 16; i++) {
    if (!m[i]) continue
    if (last >= 0) m[last].len = Math.min(4, i - last)
    last = i
  }
  if (last >= 0) m[last].len = Math.min(4, 16 - last)
  return m
}

// --- Instruments ---------------------------------------------------------------------------------
const gainNode = (v) => {
  const g = A.ctx.createGain()
  g.gain.value = v
  return g
}
const filt = (type, f, q = 0.7) => {
  const b = A.ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

function pad(t, notes, dur) {
  const ctx = A.ctx
  const cut = 520 + 520 * s.energy
  const lp = filt('lowpass', cut, 0.5)
  lp.frequency.setValueAtTime(cut, t)
  lp.frequency.linearRampToValueAtTime(cut + 280, t + dur * 0.6) // the chord breathes open
  lp.frequency.linearRampToValueAtTime(cut, t + dur + 1)
  const g = gainNode(0)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(L.pad * (s.breath ? 1.25 : 1), t + 0.55)
  g.gain.setValueAtTime(L.pad * (s.breath ? 1.25 : 1), t + dur)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4) // overlaps the next chord: no gap
  lp.connect(g)
  route(g, { bus: s.inp, verb: M.verb })
  const oscs = COARSE_POINTER ? [['triangle', 0]] : [['triangle', -6], ['sawtooth', 6]]
  const per = 1 / (notes.length * oscs.length)
  notes.forEach((m, i) => {
    const p = ctx.createStereoPanner()
    p.pan.value = notes.length > 1 ? -0.35 + (0.7 * i) / (notes.length - 1) : 0
    const v = gainNode(per)
    v.connect(p).connect(lp)
    for (const [type, cents] of oscs) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = mtof(m)
      o.detune.value = cents + rnd(-2, 2)
      o.connect(v)
      o.start(t)
      o.stop(t + dur + 1.5)
    }
  })
}

function bass(t, midi, len, vel) {
  const f = mtof(midi)
  const d = len * eighth()
  tone({ t, type: 'sine', f, a: 0.015, hold: d * 0.55, d: d * 0.6 + 0.15, gain: L.bass * vel, bus: s.inp })
  tone({ t, type: 'triangle', f, a: 0.015, hold: d * 0.3, d: d * 0.45 + 0.1, gain: L.bass * 0.4 * vel, lp: 380, bus: s.inp })
}

// Felt mallet: fundamental rings, the brighter partials die almost at once.
function mallet(t, midi, vel, len) {
  const ctx = A.ctx
  const f = mtof(midi)
  const d = Math.max(0.7, Math.min(2.2, len * eighth() * 1.3 + 0.5))
  const out = gainNode(L.keys * vel)
  const p = ctx.createStereoPanner()
  p.pan.value = -0.12 + rnd(-0.05, 0.05)
  out.connect(p)
  route(p, { bus: s.inp, verb: M.verb })
  p.connect(s.echo)
  for (const [ratio, amp, decay] of [[1, 1, d], [2, 0.14, d * 0.28], [4, 0.035, 0.07]]) {
    const o = ctx.createOscillator()
    o.frequency.value = f * ratio
    const g = gainNode(0)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(amp, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006 + decay)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + decay + 0.05)
  }
}

// Muted harp: a triangle whose lowpass closes as it rings.
function pluck(t, midi, vel) {
  const ctx = A.ctx
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = mtof(midi)
  const lp = filt('lowpass', 2000, 0.6)
  lp.frequency.setValueAtTime(2000, t)
  lp.frequency.exponentialRampToValueAtTime(420, t + 0.3)
  const g = gainNode(0)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(L.pluck * vel, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
  o.connect(lp).connect(g)
  route(g, { bus: s.inp, pan: 0.28, verb: M.verb * 0.6 })
  o.start(t)
  o.stop(t + 0.6)
}

const kick = (t, vel) => tone({ t, f: 105, f2: 44, glide: 0.11, a: 0.003, d: 0.34, gain: L.kick * vel, bus: s.inp })
function handDrum(t, high, vel) {
  const f = high ? 290 : 196
  tone({ t, f, f2: f * 0.86, glide: 0.07, a: 0.002, d: high ? 0.16 : 0.22, gain: L.hand * vel, bus: s.inp, pan: high ? 0.2 : -0.15, verb: 0.15 })
  burst({ t, noise: 'pink', type: 'bandpass', f: high ? 850 : 560, q: 1.3, a: 0.001, d: 0.025, gain: L.hand * 0.5 * vel, bus: s.inp })
}
function brush(t, vel) {
  burst({ t, noise: 'pink', type: 'bandpass', f: 1400, q: 0.6, a: 0.006, d: 0.17, gain: L.brush * vel, bus: s.inp, verb: 0.2 })
  tone({ t, f: 205, f2: 175, glide: 0.06, a: 0.002, d: 0.1, gain: L.brush * 0.5 * vel, bus: s.inp })
}
const shaker = (t, vel) => burst({ t, noise: 'pink', type: 'bandpass', f: 1700, q: 0.9, a: 0.014, d: 0.05, gain: L.shaker * vel, bus: s.inp, pan: 0.35 })

// --- Arrangement ---------------------------------------------------------------------------------------
function startSection() {
  s.section++
  const part = s.section % 4
  if (part === 0) {
    // A new song: new key (after the first), progressions and motifs.
    if (s.section > 0) setKey(pick(KEYS.filter((k) => k !== s.key)))
    s.progA = pick(PROGS)
    s.progB = pick(PROGS.filter((p) => p !== s.progA))
    const density = 0.55 + s.energy * 0.6
    s.motifA = makeMotif(density)
    s.motifB = makeMotif(density)
  }
  // A, A (the same tune again: familiarity), B, B with a breather at its start.
  const motif = part < 2 ? s.motifA : s.motifB
  s.prog = part < 2 ? s.progA : s.progB
  s.breath = part === 3
  s.arp = pick(ARPS)
  s.phrase = [motif, motif, vary(motif), makeMotif(0.7, true)]
}

function startBar(t) {
  // Energy moves a little each bar, so the band builds up rather than jumping.
  s.energy += Math.max(-0.12, Math.min(0.12, s.target - s.energy))
  s.deg = s.prog[s.bar]
  const pcs = chordPcs(s.deg)
  s.padNotes = voice(pcs, 52)
  s.arpNotes = voice(pcs, 62)
  s.rootBass = 36 + mod(pcs[0] - 36, 12) // C2..B2
  s.bass = BASS[s.energy < 0.45 ? 0 : s.energy < 0.72 ? 1 : 2]
  pad(t, s.padNotes, 8 * eighth())
}

function playSlot(slot, t) {
  const e = s.energy
  const bar = s.bar
  const lastBar = bar === 7
  const quiet = s.breath && bar < 4 // the breather: pad, melody and a whisper of bass

  // Bass
  if (!quiet || bar >= 2) {
    for (const [sl, len, off] of s.bass) if (sl === slot) bass(t, s.rootBass + off, len, sl === 0 ? 1 : 0.8)
  }

  // Drums
  if (!quiet) {
    if (e >= 0.5 && (slot === 0 || slot === 4 || (e >= 0.78 && slot === 7 && Math.random() < 0.5))) kick(t, slot === 0 ? 1 : 0.85)
    if (e >= 0.62 && (slot === 2 || slot === 6)) brush(t, rnd(0.85, 1))
    if (e >= 0.82 && slot % 2 === 1) shaker(t, rnd(0.6, 1))
    if (e >= 0.2) {
      const hand = { 2: [0, 0.8], 5: [1, 0.7], 6: [0, 0.6] }[slot]
      if (hand && Math.random() < 0.85) handDrum(t, hand[0] === 1, hand[1] * rnd(0.8, 1))
      if (e >= 0.6 && slot === 3 && Math.random() < 0.4) handDrum(t, true, 0.5)
    }
    // A little fill into the next section.
    if (lastBar && e >= 0.4 && slot >= 5) handDrum(t, slot !== 5, 0.55 + 0.15 * (slot - 5))
  }

  // Pluck arpeggio (joins once the climb gets going)
  if (e >= 0.55 && !quiet) {
    const idx = s.arp[slot] % s.arpNotes.length
    pluck(t, s.arpNotes[idx], slot % 2 ? 0.7 : 1)
  }

  // Melody
  const unit = bar >> 1
  const u = (bar & 1) * 8 + slot
  const n = s.phrase[unit]?.[u]
  if (!n || (quiet && unit === 1)) return
  s.pos += n.step
  if (s.pos > s.hi) s.pos = s.hi - 1
  if (s.pos < s.lo) s.pos = s.lo + 1
  if (n.root) s.pos = nearestChordTone(s.pos, s.deg, true)
  else if (u % 4 === 0) s.pos = nearestChordTone(s.pos, s.deg)
  else if (!PENTA.has(mod(s.pos, 7)) && !isChordTone(s.pos, s.deg)) s.pos += n.step >= 0 ? 1 : -1
  s.pos = Math.max(s.lo, Math.min(s.hi, s.pos))
  mallet(t + rnd(0, 0.008), idxMidi(s.pos), n.v * rnd(0.88, 1), n.len)
}

function nextBar() {
  s.slot = 0
  s.bar++
  if (s.bar === 8) {
    s.bar = 0
    startSection()
  }
}

function schedule() {
  if (!s.ok) return
  if (!ready() || !s.on || isMuted()) {
    s.resync = true // silent: plan nothing, pick up again at a bar line
    return
  }
  const t = A.ctx.currentTime
  if (s.resync || s.next < t - 0.05) {
    // First start, back from silence, or the main thread stalled: restart on a fresh bar.
    if (!s.resync || s.slot !== 0) nextBar()
    s.resync = false
    s.next = t + 0.08
  }
  const e8 = eighth()
  while (s.next < t + M.lookahead) {
    if (s.slot === 0) startBar(s.next)
    const swing = s.slot % 2 ? e8 * M.swing : 0
    playSlot(s.slot, s.next + swing)
    s.next += e8
    s.slot++
    if (s.slot === 8) nextBar()
  }
}

// --- Setup + API ------------------------------------------------------------------------------------
onStart((ctx) => {
  // Layers -> soft ceiling (no fizz above ~3 kHz) -> rumble cut -> on/off fade -> music bus.
  s.inp = gainNode(1)
  s.out = gainNode(0)
  s.inp.connect(filt('lowpass', M.lowpass, 0.5)).connect(filt('highpass', 38, 0.7)).connect(s.out).connect(A.music)
  // Dark dotted-eighth echo on the melody, a little to the right of it.
  const dl = ctx.createDelay(2)
  dl.delayTime.value = (60 / M.bpm) * M.echo.beats
  const dark = filt('lowpass', M.echo.tone, 0.5)
  const fb = gainNode(M.echo.feedback)
  dl.connect(dark).connect(fb).connect(dl)
  const wet = ctx.createStereoPanner()
  wet.pan.value = 0.35
  dark.connect(gainNode(M.echo.mix)).connect(wet).connect(s.inp)
  s.echo = dl
  setKey(pick(KEYS))
  s.section = -1
  startSection()
  s.ok = true
  if (s.on) s.out.gain.setTargetAtTime(1, ctx.currentTime + M.startDelay, M.fadeIn / 3)
  setInterval(schedule, 50)
  if (import.meta.env?.DEV) window.__music = s // dev: inspect energy / key / section while tuning
})

// Height above the lobby (m): relaxed in the lobby, fuller the higher the climb.
export function setAltitude(m) {
  s.alt = Math.max(0, Number(m) || 0)
  // sqrt: the lift is felt early in the climb, not only near the summit.
  s.target = s.alt < 1.5 ? M.lobbyEnergy : M.climbEnergy + (1 - M.climbEnergy) * Math.sqrt(clamp01(s.alt / M.climbTop))
}

export const isMusicOn = () => s.on
export function setMusicOn(on) {
  s.on = !!on
  try {
    localStorage.setItem(M.storageKey, s.on ? 'on' : 'off')
  } catch {
    // Storage blocked: this session only.
  }
  if (s.out) s.out.gain.setTargetAtTime(s.on ? 1 : 0, A.ctx.currentTime, s.on ? 0.6 : 0.25)
}
export const toggleMusic = () => setMusicOn(!s.on)
