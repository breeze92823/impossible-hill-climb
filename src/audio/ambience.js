// The air around the player, all synthesised:
//  - wind: stereo pink noise through a band-pass whose centre wanders, with
//    gusts (slow swells scheduled ahead); a soft breeze in the lobby, a real
//    blow near the top of the hill (setAltitude)
//  - whistle: a narrow resonant band that only shows up high on the hill (wind
//    over the cliff edges)
//  - birds: little songbird phrases now and then, only down in the lobby
// One scheduler tick (every AUDIO.ambience.tick s) plans gusts and birds ahead
// of the clock; update() moves the continuous levels every frame.
import { AUDIO } from '../config.js'
import { A, onStart, ready } from './core.js'
import { env, rnd, route } from './synth.js'

const M = AUDIO.ambience
const s = {
  ok: false,
  wind: null, // altitude level
  gust: null, // gust envelope
  windF: null,
  whistle: null,
  whistleF: null,
  alt: 0,
  nextGust: 0,
  nextBird: 0,
}

const filt = (type, f, q = 0.7) => {
  const b = A.ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
const gain = (v) => {
  const g = A.ctx.createGain()
  g.gain.value = v
  return g
}
function loop(buf) {
  const src = A.ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.start(0, Math.random() * (buf.duration - 0.1))
  return src
}

onStart((ctx) => {
  const bus = A.amb
  s.wind = gain(M.breeze)
  s.wind.connect(bus)
  s.gust = gain(0.6)
  s.windF = filt('bandpass', 500, 0.6)
  loop(A.noise.pinkStereo).connect(s.windF).connect(s.gust).connect(s.wind)
  // A low body under it so a big gust has weight.
  loop(A.noise.brownStereo).connect(filt('lowpass', 160, 0.6)).connect(gain(0.5)).connect(s.gust)
  s.whistle = gain(0)
  s.whistleF = filt('bandpass', 900, 18)
  loop(A.noise.pinkStereo).connect(s.whistleF).connect(gain(6)).connect(s.whistle).connect(bus)
  s.nextGust = ctx.currentTime + 0.5
  s.nextBird = ctx.currentTime + rnd(2, 5)
  s.ok = true
  setInterval(schedule, M.tick * 1000)
})

const windK = () => Math.max(0, Math.min(1, s.alt / M.windTop))

// One gust: swell up (the band brightens), hold a moment, ease off.
function gust(t) {
  const k = windK()
  const up = rnd(1.2, 3)
  const hold = rnd(0.3, 1.5)
  const down = rnd(1.5, 3.5)
  const peak = rnd(0.75, 1.15) + k * 0.25
  const g = s.gust.gain
  const f = s.windF.frequency
  g.cancelScheduledValues(t)
  f.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  f.setValueAtTime(f.value, t)
  g.linearRampToValueAtTime(peak, t + up)
  f.exponentialRampToValueAtTime(rnd(650, 1100) + k * 500, t + up)
  g.setValueAtTime(peak, t + up + hold)
  g.linearRampToValueAtTime(rnd(0.35, 0.6), t + up + hold + down)
  f.exponentialRampToValueAtTime(rnd(320, 520), t + up + hold + down)
  // The whistle sings at the top of the gust, its pitch riding the wind speed.
  const wf = s.whistleF.frequency
  wf.cancelScheduledValues(t)
  wf.setValueAtTime(wf.value, t)
  wf.exponentialRampToValueAtTime(rnd(800, 1300), t + up)
  wf.exponentialRampToValueAtTime(rnd(600, 850), t + up + hold + down)
  return t + up + hold + down * rnd(0.4, 0.9)
}

// A small songbird phrase: 2-6 quick chirps (fast downward sweeps with a flick up),
// sometimes a trill. Far off: lowpassed and sent to the reverb.
function bird(t) {
  const ctx = A.ctx
  const out = gain(M.bird * rnd(0.5, 1))
  route(out, { bus: A.amb, pan: rnd(-0.85, 0.85), verb: 0.35 })
  const lp = filt('lowpass', 6000, 0.5)
  lp.connect(out)
  const base = rnd(2600, 4200)
  const notes = 2 + Math.floor(Math.random() * 5)
  const trill = Math.random() < 0.3
  let at = t
  for (let i = 0; i < notes; i++) {
    const len = trill ? rnd(0.03, 0.045) : rnd(0.05, 0.11)
    const f0 = base * rnd(0.9, 1.15) * (trill ? 1 : 1 + (i % 2) * 0.12)
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(f0 * 1.25, at)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.75, at + len * 0.75)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.95, at + len)
    const g = gain(0)
    env(g.gain, at, 0.006, 1, len - 0.006)
    o.connect(g).connect(lp)
    o.start(at)
    o.stop(at + len + 0.03)
    at += len + (trill ? rnd(0.01, 0.02) : rnd(0.04, 0.12))
  }
}

function schedule() {
  if (!s.ok || !ready()) return
  const t = A.ctx.currentTime
  const ahead = t + M.tick * 1.5
  if (s.nextGust < ahead) s.nextGust = gust(Math.max(t, s.nextGust))
  if (s.nextBird < ahead) {
    if (s.alt < M.birdMaxAlt) {
      bird(Math.max(t, s.nextBird))
      // Another bird often answers.
      if (Math.random() < 0.35) bird(Math.max(t, s.nextBird) + rnd(0.6, 1.4))
    }
    s.nextBird = t + rnd(...M.birdEvery)
  }
}

// Height above the lobby (m): 0 in the lobby, up to ~windTop at the summit.
export function setAltitude(m) {
  s.alt = Math.max(0, Number(m) || 0)
  if (!s.ok || !A.ctx || A.ctx.state !== 'running') return
  const t = A.ctx.currentTime
  const k = windK()
  s.wind.gain.setTargetAtTime(M.breeze + (M.wind - M.breeze) * Math.pow(k, 0.8), t, 0.5)
  s.whistle.gain.setTargetAtTime(M.whistle * Math.max(0, (k - 0.35) / 0.65), t, 0.5)
}
