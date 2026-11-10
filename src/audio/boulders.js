// Rolling boulders (up to 3 at once), each a positional loop built once:
//  - rumble: stereo brown noise through a lowpass that opens as it gets closer,
//    plus a sub sine: close boulders are mostly chest-thumping low end
//  - turn thump: once per revolution (speed / circumference) the rock's flat
//    side slams down; a peaky LFO pumps the rumble level
//  - crunch: gravel crushed under it, band-passed white noise chopped by a
//    spiky random envelope (noise -> slow lowpass -> power curve)
//  - bounces: random heavy thuds scheduled from the main thread
// Distance sets level (inverse-square-ish with a floor so it never pops in), a
// lowpass (air eats the highs far away) and the reverb send (far = more echo
// off the cliffs).
import { AUDIO } from '../config.js'
import { A, onStart, voice } from './core.js'
import { burst, rnd, tone } from './synth.js'

const B = AUDIO.boulder
const MAX = 3
const voices = []
let ok = false
let lastCall = 0

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
function curve(fn) {
  const n = 512
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1)
  return c
}

onStart((ctx) => {
  const peaky = curve((x) => Math.pow(Math.max(0, x), 4)) // one hard thump per turn
  const spiky = curve((x) => Math.min(1, Math.pow(Math.abs(x) * 1.6, 3))) // gravel grains
  for (let i = 0; i < MAX; i++) {
    const v = {}
    v.pan = ctx.createStereoPanner()
    v.level = gain(0)
    v.air = filt('lowpass', 6000, 0.5)
    v.air.connect(v.level).connect(v.pan).connect(A.boulder)
    v.send = gain(0)
    v.pan.connect(v.send).connect(A.verb)
    // Rumble + sub through a pumping amp.
    v.amp = gain(0.55)
    v.amp.connect(v.air)
    v.rumbleF = filt('lowpass', 220, 0.8)
    v.rumble = gain(B.rumble)
    loop(A.noise.brownStereo).connect(v.rumbleF).connect(v.rumble).connect(v.amp)
    v.subOsc = ctx.createOscillator()
    v.subOsc.frequency.value = 42 + i * 4
    v.sub = gain(0)
    v.subOsc.connect(v.sub).connect(v.amp)
    v.subOsc.start()
    v.lfo = ctx.createOscillator()
    v.lfo.frequency.value = 0.4
    const sh = ctx.createWaveShaper()
    sh.curve = peaky
    v.lfoDepth = gain(0.5)
    v.lfo.connect(sh).connect(v.lfoDepth).connect(v.amp.gain)
    v.lfo.start()
    // Gravel crunch.
    v.crunchAmp = gain(0)
    v.crunch = gain(0)
    loop(A.noise.white).connect(filt('bandpass', 1500 + i * 300, 0.7)).connect(v.crunchAmp).connect(v.crunch).connect(v.air)
    const mod = filt('lowpass', 28 + i * 5, 0.7)
    const sh2 = ctx.createWaveShaper()
    sh2.curve = spiky
    // The slow lowpass leaves the noise ~0.01 RMS: lift it into the curve's working range.
    loop(A.noise.white).connect(mod).connect(gain(40)).connect(sh2).connect(v.crunchAmp.gain)
    v.next = 0
    v.k = 0
    v.p = 0
    voices.push(v)
  }
  ok = true
})

const clamp01 = (x) => Math.max(0, Math.min(1, x))
// 0..1 how close (1 = touching).
const proximity = (d) => 1 / (1 + Math.pow(Math.max(0, d) / B.near, 2))

// list: [{ distance m, speed m/s, pan -1..1 }] (0..3), every frame.
export function update(list) {
  if (!ok || !A.ctx || A.ctx.state !== 'running') return
  const t = A.ctx.currentTime
  const nowMs = performance.now()
  const fast = nowMs - lastCall > 250 // first frame after a gap: jump instead of gliding
  lastCall = nowMs
  const n = Array.isArray(list) ? Math.min(MAX, list.length) : 0
  for (let i = 0; i < MAX; i++) {
    const v = voices[i]
    const b = i < n ? list[i] : null
    const K = fast ? 0.01 : 0.08
    if (!b) {
      v.level.gain.setTargetAtTime(0, t, 0.15)
      v.send.gain.setTargetAtTime(0, t, 0.15)
      v.k = 0
      continue
    }
    const d = Math.max(0, Number(b.distance) || 0)
    const sp = Math.max(0, Number(b.speed) || 0)
    const k = proximity(d)
    const roll = clamp01(sp / 20) // a slow boulder grinds, a fast one roars
    const lvl = Math.max(0.02, k) * (0.35 + 0.65 * roll)
    v.k = k
    v.p = Math.max(-1, Math.min(1, Number(b.pan) || 0))
    v.level.gain.setTargetAtTime(lvl, t, K)
    v.send.gain.setTargetAtTime(0.25 + 0.5 * (1 - k), t, K)
    v.pan.pan.setTargetAtTime(v.p * (0.4 + 0.5 * (1 - k)), t, K) // right on top of you = everywhere
    v.air.frequency.setTargetAtTime(700 + 7000 * Math.pow(k, 0.8), t, K)
    v.rumbleF.frequency.setTargetAtTime(110 + 260 * roll + 200 * k, t, K)
    v.sub.gain.setTargetAtTime(B.sub * Math.pow(k, 1.3) * (0.4 + 0.6 * roll), t, K)
    v.lfo.frequency.setTargetAtTime(Math.max(0.05, sp / (2 * Math.PI * B.radius)), t, 0.2)
    v.lfoDepth.gain.setTargetAtTime(0.25 + 0.5 * roll, t, 0.2)
    v.crunch.gain.setTargetAtTime(B.crunch * (0.5 + 0.5 * roll) * (0.3 + 0.7 * k), t, K)
    // A bounce now and then: more often the faster it rolls.
    if (sp > 2 && t > v.next) {
      v.next = t + rnd(0.5, 1.6) / (0.5 + roll)
      if (k > 0.04) bounce(t + 0.02, k, v.p, roll)
    }
  }
}

function bounce(t, k, pan, roll) {
  if (!voice(0.4, 1)) return
  const g = B.bounce * k * rnd(0.5, 1) * (0.5 + 0.5 * roll)
  const bus = A.boulder
  tone({ t, f: rnd(48, 62), f2: 30, d: 0.35, gain: g, pan: pan * 0.5, bus })
  burst({ t, noise: 'brown', type: 'lowpass', f: 180 + 500 * k, q: 0.7, a: 0.004, d: 0.3, gain: g * 0.9, pan: pan * 0.5, bus, verb: 0.3 })
  if (k > 0.2) burst({ t, f: rnd(1500, 3000), q: 0.8, a: 0.001, d: 0.05, gain: g * 0.3, pan, bus })
}

// 0..1 camera shake suggestion for a boulder `distance` m away.
export function cameraShakeFor(distance) {
  const d = Number(distance)
  if (!Number.isFinite(d)) return 0
  const x = clamp01((B.shakeFar - d) / (B.shakeFar - B.shakeNear))
  return x * x
}
