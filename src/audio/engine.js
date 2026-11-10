// The player's motorcycle, as heard from the chase cam: a 270-degree parallel
// twin (the lumpy "potato" lope of a big-bore twin, but revving like a sport
// bike), plus intake, chain whine, tyres, wind and the treadmill belt.
//
// The motor is a physical model in an AudioWorklet: each firing is a pressure
// pulse (sharp rise, exponential decay, combustion grit) fired at the uneven
// 270/450-degree intervals of the twin, into two short exhaust pipes (damped comb
// filters, one per side). Off the throttle at high revs the worklet misfires now
// and then (the burble of overrun) and afterfires (a crack in the pipe); the
// main thread adds bigger pops on top. A small gearbox (AUDIO.engine.gears) maps
// speed to rpm so the bike shifts up while climbing, with a throttle cut and a
// pop on every upshift. On steep uphill the motor is driven harder into the
// saturator (it growls and strains) and lugs a little lower.
// Outside the worklet: drive -> saturation -> throttle lowpass (the muffler
// opening up) -> exhaust body peak -> high-shelf cut. Where AudioWorklet isn't
// available (old browsers, blocked blob: modules) two oscillators stand in.
import { AUDIO } from '../config.js'
import { A, onStart, voice } from './core.js'
import { burst, rnd, saturation, tone } from './synth.js'

const E = AUDIO.engine

const WORKLET = `
class MotoEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1350, minValue: 300, maxValue: 16000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'decel', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }
  constructor() {
    super()
    this.phase = 0
    this.fire = 0
    this.amp = 1
    this.env = 0
    this.n = 1e9
    this.crack = 0 // afterfire noise samples left
    this.crackAmp = 0
    this.pipes = [{ buf: new Float32Array(4096), lp: 0 }, { buf: new Float32Array(4096), lp: 0 }]
    this.w = 0
    this.grit = 0
    this.dc = [0, 0]
    this.dcx = [0, 0]
    this.seed = 91731
    this.wander = 0
    this.wanderTo = 0
    this.wanderIn = 0
    // 270-degree twin: firings 270 then 450 crank degrees apart (mean 360), the second a touch weaker.
    this.gap = [0.75, 1.25]
    this.str = [1.0, 0.88]
  }
  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 4294967296
  }
  process(inputs, outputs, params) {
    const L = outputs[0][0]
    const R = outputs[0][1] ?? L
    if (!L) return true
    const rpm = params.rpm[0]
    const load = params.load[0]
    const decel = params.decel[0]
    if (--this.wanderIn <= 0) {
      this.wanderTo = (this.rand() * 2 - 1) * (0.012 + 0.02 * decel)
      this.wanderIn = 30 + Math.floor(this.rand() * 70)
    }
    this.wander += (this.wanderTo - this.wander) * 0.03
    const fireHz = (rpm / 60) * (1 + this.wander) // 2 cylinders, 4-stroke: one firing per turn on average
    const attack = Math.max(4, Math.round(sampleRate * 0.0006)) // punchy but no click
    const tau = 0.0016 + 0.0035 * (1 - load) * (1500 / Math.max(rpm, 600))
    const decay = Math.exp(-1 / (sampleRate * tau))
    const D0 = Math.max(16, Math.min(3500, Math.round(sampleRate / (140 + rpm * 0.026))))
    const Ds = [D0, Math.round(D0 * 1.09)]
    const fb = 0.36 + 0.2 * load
    const gritK = 0.12 + 0.3 * load
    const crackDecay = Math.exp(-1 / (sampleRate * 0.0018))
    let env = this.env
    for (let i = 0; i < L.length; i++) {
      this.phase += fireHz / sampleRate / this.gap[this.fire]
      if (this.phase >= 1) {
        this.phase -= 1
        this.fire ^= 1
        const r = this.rand()
        if (r < decel * 0.3) {
          this.amp = 0.04 // misfire on overrun: the burble
        } else {
          this.amp = this.str[this.fire] * (0.86 + 0.28 * this.rand()) * (0.4 + 0.6 * load)
          if (this.rand() < decel * 0.09) {
            this.amp *= 1.8 // afterfire: unburnt fuel lighting in the pipe
            this.crack = Math.round(sampleRate * 0.006)
            this.crackAmp = 0.9 + 0.6 * this.rand()
          }
        }
        this.n = 0
      }
      if (this.n < attack) {
        const x = Math.sin((Math.PI / 2) * (this.n / attack))
        env = x * x
      } else env *= decay
      this.n++
      this.grit += 0.14 * ((this.rand() * 2 - 1) - this.grit)
      let pulse = this.amp * env * (1 + gritK * this.grit * 3)
      if (this.crack > 0) {
        this.crack--
        this.crackAmp *= crackDecay
        pulse += (this.rand() * 2 - 1) * this.crackAmp
      }
      for (let b = 0; b < 2; b++) {
        const p = this.pipes[b]
        const delayed = p.buf[(this.w - Ds[b] + 4096) & 4095]
        p.lp += 0.26 * (delayed - p.lp)
        const y = pulse + fb * p.lp
        p.buf[this.w] = y
        const o = y - this.dcx[b] + 0.995 * this.dc[b]
        this.dcx[b] = y
        this.dc[b] = o
      }
      this.w = (this.w + 1) & 4095
      L[i] = (this.dc[0] * 0.72 + this.dc[1] * 0.28) * 0.45
      R[i] = (this.dc[1] * 0.72 + this.dc[0] * 0.28) * 0.45
    }
    this.env = env
    return true
  }
}
registerProcessor('moto-engine', MotoEngine)
`

const s = {
  ok: false,
  rpm: null,
  load: null,
  decel: null,
  drive: null, // pre-saturation drive (uphill strain)
  makeup: null,
  tone: null,
  motor: null,
  intakeGain: null,
  intakeFilter: null,
  chainOsc: null,
  chainGain: null,
  tireGain: null,
  tireFilter: null,
  windGain: null,
  beltGain: null,
  beltOsc: null,
  squealGain: null,
  squealFilter: null,
  squealOsc: null,
  squealVib: null,
  ground: null, // road-noise layers (tyres, chain) fade out in the air
  air: 0, // smoothed 0..1 airborne
  bog: 0, // landing load dip
  lastThrottle: 0,
  presence: 1,
  gear: 0,
  vs: 0, // smoothed speed (engine inertia)
  prevV: 0,
  accel: 0,
  rpmNow: E.idle,
  cutUntil: 0,
  lastShift: 0,
  popAt: 0,
  blip: 0,
  lastCall: 0,
}

function loop(kind, stereo = false) {
  const src = A.ctx.createBufferSource()
  src.buffer = stereo ? (kind === 'brown' ? A.noise.brownStereo : A.noise.pinkStereo) : A.noise[kind]
  src.loop = true
  src.start(0, Math.random() * (src.buffer.duration - 0.1))
  return src
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

async function motorSource(ctx) {
  try {
    if (!ctx.audioWorklet) throw new Error('no worklet')
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const node = new AudioWorkletNode(ctx, 'moto-engine', { outputChannelCount: [2] })
    return { node, rpm: node.parameters.get('rpm'), load: node.parameters.get('load'), decel: node.parameters.get('decel') }
  } catch {
    // Fallback: a sawtooth at the firing rate plus a half-rate square for the lope.
    const out = gain(0.4)
    const a = ctx.createOscillator()
    a.type = 'sawtooth'
    const b = ctx.createOscillator()
    b.type = 'square'
    const bg = gain(0.35)
    a.connect(out)
    b.connect(bg).connect(out)
    a.start()
    b.start()
    const rpm = {
      setTargetAtTime(v, t, k) {
        a.frequency.setTargetAtTime(v / 60, t, k)
        b.frequency.setTargetAtTime(v / 120, t, k)
      },
    }
    return { node: out, rpm, load: gain(0).gain, decel: gain(0).gain }
  }
}

onStart(async (ctx) => {
  const bus = A.engine
  const m = await motorSource(ctx)
  s.rpm = m.rpm
  s.load = m.load
  s.decel = m.decel
  s.drive = gain(1)
  const shaper = ctx.createWaveShaper()
  shaper.curve = saturation(1.8)
  shaper.oversample = '2x'
  s.makeup = gain(1)
  s.tone = filt('lowpass', 700, 0.6)
  const body = filt('peaking', 150, 1)
  body.gain.value = 5 // chest of the exhaust note
  const soft = filt('highshelf', 3200, 0.7)
  soft.gain.value = -7 // no fizz up top: that is what tires the ear on a loop
  s.motor = gain(0)
  m.node.connect(s.drive).connect(shaper).connect(s.makeup).connect(s.tone).connect(body).connect(soft).connect(s.motor).connect(bus)

  // Intake: the airbox gasping, band-passed pink noise opening with throttle.
  s.intakeFilter = filt('bandpass', 700, 0.9)
  s.intakeGain = gain(0)
  loop('pink', true).connect(s.intakeFilter).connect(s.intakeGain).connect(bus)
  // Chain + gearbox whine: a soft triangle following road speed.
  s.chainOsc = ctx.createOscillator()
  s.chainOsc.type = 'triangle'
  s.chainOsc.frequency.value = 200
  s.chainGain = gain(0)
  s.ground = gain(1)
  s.ground.connect(bus)
  s.chainOsc.connect(filt('bandpass', 1400, 0.6)).connect(s.chainGain).connect(s.ground)
  s.chainOsc.start()
  // Knobbly tyres on the studded slope: low rolling roar.
  s.tireFilter = filt('bandpass', 300, 0.6)
  s.tireGain = gain(0)
  loop('brown', true).connect(s.tireFilter).connect(s.tireGain).connect(s.ground)
  // Wind rushing past the helmet at speed.
  s.windGain = gain(0)
  loop('pink', true).connect(filt('highpass', 1400, 0.5)).connect(s.windGain).connect(bus)
  // Treadmill: belt rollers humming + rubber hiss.
  s.beltOsc = ctx.createOscillator()
  s.beltOsc.type = 'sawtooth'
  s.beltOsc.frequency.value = 95
  s.beltGain = gain(0)
  const beltMix = gain(1)
  s.beltOsc.connect(filt('lowpass', 500, 1.2)).connect(beltMix)
  loop('pink').connect(filt('bandpass', 1800, 1)).connect(gain(0.6)).connect(beltMix)
  beltMix.connect(s.beltGain).connect(bus)
  s.beltOsc.start()
  // Tyre squeal: narrow-band noise around 1.2 kHz with a faint warbling tone inside it.
  s.squealFilter = filt('bandpass', 1200, 7)
  s.squealGain = gain(0)
  const squealMix = gain(1)
  loop('pink').connect(s.squealFilter).connect(squealMix)
  s.squealOsc = ctx.createOscillator()
  s.squealOsc.type = 'triangle'
  s.squealOsc.frequency.value = 1100
  s.squealVib = ctx.createOscillator()
  s.squealVib.frequency.value = 9
  const vibDepth = gain(28)
  s.squealVib.connect(vibDepth).connect(s.squealOsc.frequency)
  s.squealOsc.connect(filt('lowpass', 2200, 0.7)).connect(gain(0.05)).connect(squealMix)
  squealMix.connect(filt('highshelf', 2500, 0.7)).connect(s.squealGain).connect(bus)
  s.squealOsc.start()
  s.squealVib.start()

  s.ok = true
})

// Engine events for the visuals: onEngine((type, k) => ...) with 'pop' (k 0..1, an exhaust
// pop / afterfire), 'shift' (k = new gear) and 'launch'. Returns an unsubscribe function.
const listeners = new Set()
export function onEngine(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(type, k) {
  for (const fn of listeners) {
    try {
      fn(type, k)
    } catch {}
  }
}

// A quick throttle blip (jumps, equips).
export function blip(k = 0.5) {
  s.blip = Math.min(1, s.blip + k)
}

// Exhaust pop / crackle on the overrun or an upshift: a crack in the pipe and a low thump.
function pop(t, k) {
  if (!voice(0.08, 1)) return
  const bus = A.engine
  const pan = rnd(-0.2, 0.2)
  burst({ t, type: 'highpass', f: rnd(1800, 3200), q: 0.6, a: 0.0004, d: rnd(0.006, 0.016), gain: E.crackle * k * rnd(0.6, 1.2), pan, bus })
  burst({ t, noise: 'pink', f: rnd(500, 900), q: 1, a: 0.0006, d: rnd(0.02, 0.045), gain: E.crackle * 0.9 * k * rnd(0.5, 1), pan, bus })
  tone({ t, f: rnd(90, 130), f2: 45, d: 0.05, gain: E.crackle * 0.8 * k, pan, bus })
  emit('pop', k)
}

// Gearbox: the dog rings snapping in, a dull metal clunk plus a tick.
function clunk(t, up) {
  if (!voice(0.06, 1)) return
  const bus = A.engine
  const k = E.clunk * (up ? 1 : 0.7)
  tone({ t, f: rnd(150, 180) * (up ? 1 : 0.85), f2: 70, d: 0.045, gain: k, bus })
  burst({ t, type: 'bandpass', f: rnd(2200, 2800), q: 2.5, a: 0.0005, d: 0.012, gain: k * 0.55, bus })
}

// Launch: the rear tyre breaking loose for a moment, a rubbery chirp.
function chirp(t) {
  if (!voice(0.2, 1)) return
  const bus = A.engine
  burst({ t, noise: 'pink', f: 1500, f2: 1050, q: 5, a: 0.01, hold: 0.06, d: 0.14, gain: E.chirp, bus })
  tone({ t, type: 'triangle', f: 1250, f2: 950, glide: 0.2, a: 0.01, hold: 0.05, d: 0.12, gain: E.chirp * 0.12, lp: 2200, bus })
}

const K = 0.05 // smoothing time constant (s)
const clamp01 = (x) => Math.max(0, Math.min(1, x))

// st: { speed m/s, throttle 0..1, uphill 0..1, onTreadmill, slip 0..1 (tyre squeal), air (bool) }
export function update(st) {
  if (!s.ok || !A.ctx || A.ctx.state !== 'running') return
  const t = A.ctx.currentTime
  const nowMs = performance.now()
  const dt = Math.min(0.1, Math.max(0.001, (nowMs - (s.lastCall || nowMs - 16)) / 1000))
  s.lastCall = nowMs
  const tread = !!st.onTreadmill
  const uphill = clamp01(Number(st.uphill) || 0)
  let throttle = clamp01(Number(st.throttle) || 0)
  let v = Math.max(0, Number(st.speed) || 0)
  if (tread) {
    v = Math.max(v, E.treadmillSpeed)
    throttle = Math.max(throttle, 0.7)
  }
  // Engine inertia: the revs follow the wheel speed, not teleports.
  s.vs += (v - s.vs) * (1 - Math.exp(-dt / 0.18))
  const vs = s.vs
  const acc = (vs - s.prevV) / dt
  s.prevV = vs
  s.accel += (Math.abs(acc) - s.accel) * (1 - Math.exp(-dt / 0.4))
  s.blip *= Math.exp(-5 * dt)
  s.bog *= Math.exp(-6 * dt)
  // Airborne: the rear wheel is free, so the revs flare and the road noise drops away; touching
  // down the motor bogs for a beat as the tyre bites again.
  const airNow = st.air && !tread ? 1 : 0
  if (!airNow && s.air > 0.5) s.bog = 1
  s.air += (airNow - s.air) * (1 - Math.exp(-dt / (airNow ? 0.12 : 0.05)))
  // Launch: throttle snapped open from a stand = a rev and a chirp from the rear tyre.
  if (!tread && !airNow && s.lastThrottle < 0.2 && throttle > 0.6 && vs < 4) {
    s.blip = Math.min(1, s.blip + 0.7)
    chirp(t + 0.04)
    emit('launch', 1)
  }
  s.lastThrottle = throttle

  // Gearbox with hysteresis; one shift per frame at most, and only one audible shift per 0.25 s.
  const G = E.gears
  if (s.gear < G.length - 1 && vs > G[s.gear] * 0.96) {
    s.gear++
    if (throttle > 0.25 && t - s.lastShift > 0.25) {
      s.lastShift = t
      s.cutUntil = t + E.shiftCut
      clunk(t, true)
      emit('shift', s.gear)
      if (Math.random() < 0.7) pop(t + E.shiftCut * 0.5, 0.7)
    }
  } else if (s.gear > 0 && vs < G[s.gear - 1] * 0.78) {
    s.gear--
    if (t - s.lastShift > 0.25) {
      s.lastShift = t
      s.blip = Math.min(1, s.blip + 0.35) // downshift rev-match blip
      clunk(t, false)
    }
  }
  const lo = s.gear ? G[s.gear - 1] * 0.62 : 0
  let x = (vs - lo) / (G[s.gear] - lo)
  if (s.gear === G.length - 1 && vs > G[s.gear]) x = 1 + 0.12 * Math.log2(vs / G[s.gear])
  x = Math.max(0, Math.min(1.12, x))
  const moving = clamp01(vs / 1.5)
  const cut = t < s.cutUntil
  // Standing still the throttle revs it in place; rolling, the gear decides.
  const span = E.max - E.idle
  let rpm = E.idle + span * ((0.1 + 0.82 * x) * moving + (1 - moving) * throttle * 0.45 + s.blip * 0.18)
  rpm *= 1 - 0.1 * uphill * throttle // lugging up the steep bit
  if (cut) rpm *= 0.9
  rpm += span * E.airRev * s.air * Math.max(throttle, 0.3)
  rpm *= 1 - 0.07 * s.bog
  rpm = Math.min(E.max * 1.08, rpm)
  const falling = rpm < s.rpmNow - 30
  s.rpmNow = rpm

  // Overrun: off the throttle with the revs up = burble and crackle.
  const high = clamp01((rpm - E.idle * 1.8) / (span * 0.5))
  const decel = cut ? 0.8 : clamp01((1 - throttle * 2.2) * high * (falling ? 1 : 0.55))
  const load = cut ? 0.05 : Math.min(1, 0.15 + throttle * 0.6 + uphill * 0.35 * throttle + s.blip * 0.3 + s.bog * 0.3)
  s.rpm.setTargetAtTime(rpm, t, cut ? 0.02 : K)
  s.load.setTargetAtTime(load, t, cut ? 0.01 : K)
  s.decel.setTargetAtTime(decel, t, 0.08)
  if (decel > 0.35 && t > s.popAt) {
    pop(t + 0.01, decel)
    s.popAt = t + rnd(0.07, 0.3) / decel
  }

  // Presence: steady cruising eases the motor back so it never wears on the ear; accelerating,
  // climbing, popping or standing still with a blip brings it forward.
  const excite = clamp01(s.accel / 5 + uphill * throttle * 0.8 + decel * 0.6 + s.blip + s.air * 0.6 + s.bog * 0.5)
  const goal = moving > 0.5 || tread ? Math.max(E.settle, excite) : E.idleLevel + (1 - E.idleLevel) * Math.max(throttle * 0.7, s.blip)
  s.presence += (goal - s.presence) * (1 - Math.exp(-dt / (goal > s.presence ? 0.15 : E.settleTime)))
  const level = s.presence

  // Uphill strain: drive the saturator harder (growl), compensate the level.
  const drive = 1 + E.strain * uphill * (0.3 + 0.7 * throttle)
  s.drive.gain.setTargetAtTime(drive, t, 0.1)
  s.makeup.gain.setTargetAtTime(1 / Math.sqrt(drive), t, 0.1)
  const r = (rpm - E.idle) / span
  s.tone.frequency.setTargetAtTime(500 + throttle * 1500 + r * 1200 + uphill * 600, t, K)
  s.motor.gain.setTargetAtTime(level * E.motor * (cut ? 0.6 : 0.6 + 0.4 * Math.max(throttle, s.blip)), t, K)
  s.intakeFilter.frequency.setTargetAtTime(500 + r * 1800, t, K)
  s.intakeGain.gain.setTargetAtTime(level * E.intake * (cut ? 0 : throttle * throttle), t, K)

  // Road side: chain whine, tyres, wind (a treadmill keeps the bike in place: no wind).
  const road = tread ? Math.min(v, E.treadmillSpeed) : vs
  s.chainOsc.frequency.setTargetAtTime(120 + road * 28, t, 0.08)
  s.chainGain.gain.setTargetAtTime(E.chain * clamp01(road / 15), t, 0.1)
  s.tireFilter.frequency.setTargetAtTime(160 + Math.min(60, road) * 14, t, 0.1)
  s.tireGain.gain.setTargetAtTime(E.tires * Math.pow(clamp01(road / 30), 0.7), t, 0.1)
  const w = tread ? 0 : clamp01(vs / 50)
  s.windGain.gain.setTargetAtTime(E.wind * w * w, t, 0.15)
  s.beltOsc.frequency.setTargetAtTime(80 + Math.min(1, road / 30) * 40, t, 0.2)
  s.beltGain.gain.setTargetAtTime(tread ? E.belt : 0, t, 0.25)
  s.ground.gain.setTargetAtTime(1 - 0.9 * s.air, t, 0.04)
  // Tyre squeal: hard cornering (slip from the rider) rising in pitch as it grips harder.
  const slip = tread ? 0 : clamp01(Number(st.slip) || 0) * (1 - s.air)
  s.squealFilter.frequency.setTargetAtTime(1000 + slip * 600 + Math.min(40, vs) * 4, t, 0.06)
  s.squealOsc.frequency.setTargetAtTime(950 + slip * 350, t, 0.06)
  s.squealGain.gain.setTargetAtTime(E.squeal * Math.pow(slip, 1.5), t, slip > 0.05 ? 0.03 : 0.08)
}
