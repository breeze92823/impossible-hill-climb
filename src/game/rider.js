import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { buildBike, spinWheels } from '../lobby/bikes.js'
import { makeAnimator, disposeAnimator } from '../avatar/animator.js'
import { rnd } from '../lobby/fx.js'
import { RIDE } from '../config.js'

// A rider = an avatar seated on a bike. The outer group is placed in the
// world (feet / tyre contact at y = 0, facing +Z when rotation.y = 0). Inside:
//   lean   rolls into corners
//   pitch  follows the ground slope under the tyres, and the flight arc in the air
//   pivot  sits on the rear tyre's contact patch: launch wheelies, squat under
//          throttle, nose dive on braking and landing
//   body   the suspension bounce + engine shake; holds the bike and the seat
//   seat   the avatar, in the animator's 'ride' pose (it dips further than the
//          bike on a landing: legs and arms soak the hit)
// fx: 'full' (the player: every particle) or 'lite' (remote riders: exhaust +
// light dust). Used for the player, remote riders and the idle NPC riders.
const tmp = new Vector3()
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const S = RIDE.suspension
const P = RIDE.pitch
const W = RIDE.wheelie
const FX = RIDE.fx

// Reused spawn record + colour arrays (pool.spawn copies them at once): no per-particle garbage.
const o = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, c0: [0, 0, 0, 0], c1: [0, 0, 0, 0], s0: 0.5, s1: 0.5, gravity: 0, drag: 0, wobble: 0 }
function col(arr, r, g, b, a) {
  arr[0] = r
  arr[1] = g
  arr[2] = b
  arr[3] = a
  return arr
}

export function createRider(scene, { pools = null, trail = false, fx = 'lite' } = {}) {
  const full = fx === 'full'
  const group = new Group()
  const lean = new Group()
  const pitchG = new Group()
  const pivot = new Group()
  const body = new Group()
  const seat = new Group()
  group.add(lean)
  lean.add(pitchG)
  pitchG.add(pivot)
  pivot.add(body)
  body.add(seat)
  scene.add(group)

  let bike = null
  let avatar = null
  let animator = null
  const seatBase = { y: 0, z: 0 }
  let rearZ = -0.7
  let rearR = 0.33

  // Motion state.
  let have = false
  let lastX = 0
  let lastY = 0
  let lastZ = 0
  let lastFacing = null
  let leanAngle = 0
  let slope = 0 // pitch group angle (rad, negative = nose up)
  let wheelie = 0 // pivot angle about the rear tyre
  let wheelieV = 0
  let susp = 0 // body offset (m)
  let suspV = 0
  let vSmooth = 0
  let accel = 0
  let air = 0 // s airborne
  let wasGrounded = true
  let minVy = 0
  let slip = 0
  let launch = 0 // s left of the launch wheelie
  let lastThrottle = 0
  let rearSpin = 0
  // Particle accumulators.
  let puff = 0
  let dustAcc = 0
  let smokeAcc = 0
  let moteAcc = 0
  let ground = 'road'
  // Frame transform for spawning (local bike space -> world).
  let fx0 = 0
  let fy0 = 0
  let fz0 = 0
  let fc = 1
  let fsn = 0
  let fpc = 1
  let fps = 0
  const ribbon = trail ? createTrail(scene) : null

  function seatAvatar() {
    if (!avatar || !bike) return
    // Hip joint height in the avatar's bind pose, measured in its parent's space.
    const probe = new Group()
    const parent = avatar.parent
    probe.add(avatar)
    avatar.position.set(0, 0, 0)
    probe.updateMatrixWorld(true)
    const hip = avatar.nodes?.LegL1 ?? avatar.nodes?.LegR1
    let hipY = 0.85
    let hipZ = 0
    if (hip) {
      hip.getWorldPosition(tmp)
      hipY = tmp.y
      hipZ = tmp.z
    }
    if (parent) parent.add(avatar)
    else seat.add(avatar)
    const s = bike.userData.seat ?? { y: 0.85, z: -0.2 }
    seatBase.y = s.y - hipY + 0.06
    seatBase.z = s.z - hipZ + 0.05
    seat.position.set(0, seatBase.y, seatBase.z)
  }

  // World position of a point in bike space (x lateral, y up, z forward), with yaw and ground pitch.
  function at(lx, ly, lz) {
    const y = ly * fpc - lz * fps
    const z = ly * fps + lz * fpc
    o.x = fx0 + fc * lx + fsn * z
    o.y = fy0 + y
    o.z = fz0 - fsn * lx + fc * z
  }
  // World velocity from bike-space components (yaw only).
  function vel(vx, vy, vz) {
    o.vx = fc * vx + fsn * vz
    o.vy = vy
    o.vz = -fsn * vx + fc * vz
  }

  function exhaustTip() {
    at(0.2, rearR * 1.25, rearZ - rearR * 0.5)
  }

  // Particle bursts. k 0..1.
  function backfire(k) {
    if (!pools || !bike) return
    // Overrun burbles pop many times a second: small pops get a lick of flame, big ones a jet.
    const n = Math.max(1, Math.round(FX.backfire * k * k * 1.6))
    for (let i = 0; i < n; i++) {
      exhaustTip()
      vel(rnd(-0.6, 0.6), rnd(0, 1.2), -rnd(4, 9) * (0.6 + k * 0.6))
      o.life = rnd(0.1, 0.22)
      col(o.c0, 4.2, 2.7, 0.9, 1)
      col(o.c1, 1.8, 0.3, 0.04, 0)
      o.s0 = rnd(0.28, 0.5) * (0.7 + k * 0.5)
      o.s1 = 0.08
      o.gravity = 0
      o.drag = 4
      o.wobble = 0
      pools.fire.spawn(o)
    }
    // Hot flash at the tip.
    exhaustTip()
    vel(0, 0, -1)
    o.life = 0.08
    col(o.c0, 4, 2.4, 1.1, 1)
    col(o.c1, 2, 0.6, 0.1, 0)
    o.s0 = 0.9 * (0.6 + k * 0.5)
    o.s1 = 0.3
    o.drag = 0
    pools.glow.spawn(o)
    // And a dark puff after it.
    for (let i = 0; i < 2; i++) {
      exhaustTip()
      vel(rnd(-0.4, 0.4), rnd(0.3, 0.9), -rnd(1.5, 3))
      o.life = rnd(0.5, 0.9)
      col(o.c0, 0.3, 0.3, 0.33, 0.45)
      col(o.c1, 0.6, 0.6, 0.65, 0)
      o.s0 = 0.3
      o.s1 = 1.1
      o.drag = 2
      pools.smoke.spawn(o)
    }
  }

  function dustPuff(n, spread, up, lifeK = 1, alpha = 0.6) {
    const [a, b] = RIDE.dust[ground] ?? RIDE.dust.road
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2
      const sp = rnd(0.5, 1) * spread
      at(Math.cos(ang) * 0.4, 0.08, rearZ * 0.5 + Math.sin(ang) * 0.6)
      o.vx = Math.cos(ang) * sp
      o.vy = rnd(0.3, 1) * up
      o.vz = Math.sin(ang) * sp
      o.life = rnd(0.6, 1.2) * lifeK
      col(o.c0, a[0], a[1], a[2], alpha)
      col(o.c1, b[0], b[1], b[2], 0)
      o.s0 = rnd(0.4, 0.7)
      o.s1 = rnd(1.6, 2.6)
      o.gravity = -1
      o.drag = 3
      o.wobble = 0
      pools.smoke.spawn(o)
    }
  }

  function grit(n, k) {
    const [a] = RIDE.dust[ground] ?? RIDE.dust.road
    for (let i = 0; i < n; i++) {
      at(rnd(-0.25, 0.25), 0.1, rearZ + rnd(-0.1, 0.1))
      vel(rnd(-1.5, 1.5), rnd(2, 5) * k, -rnd(2, 5) * k)
      o.life = rnd(0.4, 0.7)
      col(o.c0, a[0] * 0.55, a[1] * 0.55, a[2] * 0.55, 0.95)
      col(o.c1, a[0] * 0.5, a[1] * 0.5, a[2] * 0.5, 0)
      o.s0 = rnd(0.07, 0.13)
      o.s1 = 0.06
      o.gravity = -14
      o.drag = 0.4
      pools.smoke.spawn(o)
    }
  }

  function land(k) {
    suspV -= k * 18 * S.land
    wheelieV += k * 18 * P.land
    if (!pools || !bike) return
    dustPuff(Math.round((FX.landing.base + FX.landing.per * k) * (full ? 1 : 0.4)), 3 + 4 * k, 1.5, 1, 0.55 + 0.2 * k)
    if (full && k > 0.25) grit(Math.round(6 + 10 * k), 0.8 + k * 0.6)
  }

  function startLaunch() {
    launch = W.time
    if (!pools || !bike) return
    for (let i = 0; i < 4; i++) {
      exhaustTip()
      vel(rnd(-0.5, 0.5), rnd(0.3, 1), -rnd(2, 4))
      o.life = rnd(0.6, 1)
      col(o.c0, 0.35, 0.35, 0.4, 0.5)
      col(o.c1, 0.7, 0.7, 0.75, 0)
      o.s0 = 0.35
      o.s1 = 1.3
      o.gravity = 0
      o.drag = 2
      o.wobble = 0
      pools.smoke.spawn(o)
    }
    if (full) grit(12, 1.1)
  }

  return {
    group,
    get bike() {
      return bike
    },
    // 0..1 tyre slip (squeal + drift smoke) and whether the bike is properly in the air.
    get slip() {
      return slip
    },
    get airborne() {
      return air > 0.12
    },
    setBike(def) {
      if (bike) body.remove(bike)
      bike = buildBike(def)
      body.add(bike)
      const rear = bike.userData.wheels?.[1]?.parent
      rearR = bike.userData.wheelRadii?.[1] ?? bike.userData.wheelRadius ?? 0.33
      rearZ = rear ? rear.position.z : -(bike.userData.length ?? 2) * 0.35
      pivot.position.z = rearZ
      body.position.z = -rearZ
      seatAvatar()
    },
    setAvatar(next) {
      if (avatar) seat.remove(avatar)
      disposeAnimator(animator)
      avatar = next
      seat.add(avatar)
      animator = makeAnimator(avatar)
      seatAvatar()
    },
    setVisible(v) {
      group.visible = v
    },
    setTrail(color) {
      ribbon?.setColor(color)
    },
    // Engine events (audio/engine.js onEngine): 'pop' (k 0..1) and 'shift' flash flames from the
    // pipe; the bike squats a touch as the drive comes back after a shift.
    fx(type, k = 1) {
      if (type === 'pop') backfire(clamp(k, 0, 1))
      else if (type === 'shift') {
        backfire(0.35)
        wheelieV -= 0.6
      }
    },
    // Removes the rider (and its trail ribbon) from the scene for good.
    dispose() {
      scene.remove(group)
      disposeAnimator(animator)
      ribbon?.dispose()
    },
    // s: { x, y, z, facing, speed (m/s), distance (m rolled this frame), grounded, vy,
    //      throttle? 0..1 (the player's input: launch wheelies), ground? 'road' | 'lane' }
    update(dt, t, s) {
      if (!(dt > 0)) return
      group.position.set(s.x, s.y, s.z)
      group.rotation.y = s.facing
      const speed = s.speed || 0
      const grounded = s.grounded !== false
      const throttle = s.throttle ?? 0
      ground = s.ground ?? 'road'
      frame(s)

      // Frame-to-frame motion (teleports / respawns reset the springs).
      const dx = s.x - lastX
      const dy = s.y - lastY
      const dz = s.z - lastZ
      const hd = Math.hypot(dx, dz)
      const jumped = !have || hd > 6 || Math.abs(dy) > 4
      lastX = s.x
      lastY = s.y
      lastZ = s.z
      have = true
      if (jumped) {
        slope = wheelie = wheelieV = susp = suspV = slip = launch = 0
        vSmooth = speed
        accel = 0
        air = 0
        minVy = 0
        lastFacing = null
      }

      // Turn rate from the change in facing -> lean into the corner.
      let turn = 0
      if (lastFacing != null) {
        const d = Math.atan2(Math.sin(s.facing - lastFacing), Math.cos(s.facing - lastFacing))
        turn = d / dt
      }
      lastFacing = s.facing
      const Ln = RIDE.lean
      const wantLean = clamp(-turn * speed * Ln.k, -Ln.max, Ln.max)
      leanAngle += (wantLean - leanAngle) * Math.min(1, dt * Ln.rate)
      lean.rotation.z = leanAngle

      // Longitudinal acceleration (smoothed) drives squat and dive.
      const prevV = vSmooth
      vSmooth += (speed - vSmooth) * Math.min(1, dt * 10)
      accel += ((vSmooth - prevV) / dt - accel) * Math.min(1, dt * 6)

      // Air time and the landing.
      if (!grounded) {
        air += dt
        minVy = Math.min(minVy, s.vy || 0)
      } else {
        const impact = -minVy
        if (air > 0.15 || impact > 4) land(clamp(impact / 18, 0.15, 1))
        air = 0
        minVy = 0
      }
      const flying = air > 0.12

      // Ground pitch from the slope we are actually riding over; the flight arc in the air.
      const Sl = RIDE.slope
      if (!flying) {
        // Only from ground-to-ground frames: the touchdown frame still carries the fall.
        if (hd > 0.01 && !jumped && wasGrounded && grounded) {
          const want = clamp(-Math.atan2(dy, hd), -Sl.max, Sl.max)
          slope += (want - slope) * Math.min(1, dt * Sl.rate)
        }
      } else {
        const want = clamp(-Math.atan2(s.vy || 0, Math.max(speed, 5)) * Sl.air, -Sl.airMax, Sl.airMax)
        slope += (want - slope) * Math.min(1, dt * Sl.airRate)
      }
      pitchG.rotation.x = slope
      wasGrounded = grounded

      // Launch wheelie: throttle snapped open from (nearly) a stand.
      if (s.throttle != null) {
        if (grounded && lastThrottle < 0.2 && throttle > W.throttle && speed < W.maxSpeed) startLaunch()
        lastThrottle = throttle
      }
      let wTarget = clamp(-accel * P.accel, -P.maxUp, P.maxDive)
      if (launch > 0) {
        launch -= dt
        const u = 1 - launch / W.time
        wTarget -= W.angle * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.6)
      }
      if (flying) wTarget = 0
      wheelieV += ((wTarget - wheelie) * P.k - wheelieV * P.damp) * dt
      wheelie += wheelieV * dt
      if (wheelie > P.maxDive) {
        wheelie = P.maxDive
        wheelieV = Math.min(0, wheelieV)
      }
      if (wheelie < -0.7) {
        wheelie = -0.7
        wheelieV = Math.max(0, wheelieV)
      }
      // A nose dive pivots about the front tyre really; about the rear it would sink the front
      // wheel, so only nose-up uses the rear pivot and a dive just tips the body a hair.
      pivot.rotation.x = Math.min(wheelie, 0) + Math.max(wheelie, 0) * 0.35

      // Suspension spring.
      suspV += (-susp * S.k - suspV * S.damp) * dt
      susp += suspV * dt
      if (susp < S.min) {
        susp = S.min
        suspV = Math.max(0, suspV)
      } else if (susp > S.max) {
        susp = S.max
        suspV = Math.min(0, suspV)
      }

      // Engine shake: a lumpy idle at a stand, a fine road buzz on the move.
      const Sh = RIDE.shake
      const still = 1 - clamp(speed / 1.5, 0, 1)
      const amp = still * (Sh.idle + Sh.rev * throttle) + (grounded ? Sh.road * clamp(speed / 30, 0, 1) : 0)
      const buzz = amp * (Math.sin(t * 83) + 0.6 * Math.sin(t * 131 + 1.3))
      body.position.y = susp + buzz
      body.rotation.z = amp * 1.5 * Math.sin(t * 97 + 0.4)
      seat.position.y = seatBase.y + susp * S.riderExtra + (flying ? 0.08 * clamp((air - 0.12) * 5, 0, 1) : 0)

      // Tyre slip: hard cornering at speed, and the rear spinning up on a launch.
      const lat = Math.abs(turn * speed)
      let wantSlip = grounded && speed > RIDE.slip.minSpeed ? clamp((lat - RIDE.slip.from) / RIDE.slip.range, 0, 1) : 0
      if (launch > 0) wantSlip = Math.max(wantSlip, 0.6 * (launch / W.time))
      slip += (wantSlip - slip) * Math.min(1, dt * (wantSlip > slip ? 12 : 5))

      if (bike) {
        spinWheels(bike, s.distance)
        // Wheelspin on a launch, and the rear keeps turning in the air with the throttle open.
        rearSpin = launch > 0 ? 40 : flying ? 25 * throttle : 0
        if (rearSpin) bike.userData.wheels[1].rotation.x += rearSpin * dt
      }
      animator?.update(dt, {
        grounded: true,
        speed,
        verticalVelocity: 0,
        turn: clamp(turn * 0.5, -1, 1),
        riding: true,
        throttle,
        squat: clamp(-susp / 0.12, 0, 1),
        air: flying ? clamp((air - 0.12) * 5, 0, 1) : 0,
        wheelie: -wheelie,
      })

      if (pools && bike) emitParticles(dt, s, speed, throttle, grounded, flying)
      ribbon?.update(dt, t, s, bike)
    },
  }

  function frame(s) {
    fx0 = s.x
    fy0 = s.y
    fz0 = s.z
    fc = Math.cos(s.facing)
    fsn = Math.sin(s.facing)
    fpc = Math.cos(slope + Math.min(wheelie, 0))
    fps = Math.sin(slope + Math.min(wheelie, 0))
  }

  function emitParticles(dt, s, speed, throttle, grounded, flying) {
    frame(s)
    const q = full ? 1 : 0.5

    // Exhaust: thicker and darker with the throttle open.
    const E = FX.exhaust
    puff += dt * (E.base + speed * E.perSpeed + throttle * E.perThrottle) * q
    while (puff >= 1) {
      puff -= 1
      exhaustTip()
      vel(rnd(-0.3, 0.3), rnd(0.4, 1), -1.5 - throttle * 1.5)
      o.life = rnd(0.5, 0.9)
      const g = 0.88 - throttle * 0.3
      col(o.c0, g, g, g + 0.05, 0.35 + throttle * 0.15)
      col(o.c1, 0.95, 0.95, 1, 0)
      o.s0 = 0.22 + throttle * 0.1
      o.s1 = 0.8 + throttle * 0.4
      o.gravity = 0
      o.drag = 2
      o.wobble = 0
      pools.smoke.spawn(o)
    }

    // Dust off the rear tyre.
    const [a, b] = RIDE.dust[ground] ?? RIDE.dust.road
    const D = FX.dust
    if (grounded && !flying && speed > D.from) {
      dustAcc += dt * Math.min(D.max, (speed - D.from) * D.perSpeed) * (full ? 1 : D.liteScale)
      const k = clamp(speed / 20, 0, 1)
      while (dustAcc >= 1) {
        dustAcc -= 1
        at(rnd(-0.18, 0.18), 0.06, rearZ - rearR * 0.6)
        vel(rnd(-1.2, 1.2), rnd(0.6, 2.2), -rnd(1, 3))
        o.life = rnd(0.45, 0.9)
        col(o.c0, a[0], a[1], a[2], 0.18 + 0.22 * k)
        col(o.c1, b[0], b[1], b[2], 0)
        o.s0 = 0.25
        o.s1 = 0.9 + k * 0.8
        o.gravity = -1.5
        o.drag = 2.5
        o.wobble = 0
        pools.smoke.spawn(o)
      }
    } else dustAcc = 0

    // Drift / wheelspin smoke: white tyre smoke rolling off the rear.
    if (slip > 0.15 && grounded) {
      smokeAcc += dt * FX.smoke * slip * q
      while (smokeAcc >= 1) {
        smokeAcc -= 1
        at(rnd(-0.25, 0.25), 0.12, rearZ)
        vel(rnd(-1.5, 1.5), rnd(0.4, 1.4), -rnd(0.5, 2))
        o.life = rnd(0.8, 1.4)
        col(o.c0, 0.92, 0.92, 0.95, 0.55 * slip)
        col(o.c1, 1, 1, 1, 0)
        o.s0 = 0.5
        o.s1 = 2.4
        o.gravity = -0.5
        o.drag = 2
        o.wobble = 0.6
        pools.smoke.spawn(o)
      }
    }

    // Speed motes: specks hanging in the air ahead that whip past the camera (player only).
    const M = FX.motes
    if (full && speed > M.from) {
      moteAcc += dt * Math.min(M.max, (speed - M.from) * M.per)
      while (moteAcc >= 1) {
        moteAcc -= 1
        const side = Math.random() < 0.5 ? -1 : 1
        at(side * rnd(1.2, 5), rnd(0.2, 3.2), rnd(8, 16))
        o.vx = o.vy = o.vz = 0
        o.life = rnd(0.35, 0.6)
        col(o.c0, 1.4, 1.45, 1.6, 0.55)
        col(o.c1, 1.4, 1.45, 1.6, 0)
        o.s0 = 0.05
        o.s1 = 0.13
        o.gravity = 0
        o.drag = 0
        o.wobble = 0
        pools.glow.spawn(o)
      }
    } else moteAcc = 0
  }
}

// --- Trail: a vertical ribbon through the last N positions, fading out -----------
const N = 48
function createTrail(scene) {
  const pos = new Float32Array(N * 2 * 3)
  const colr = new Float32Array(N * 2 * 4)
  const idx = []
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('color', new BufferAttribute(colr, 4))
  g.setIndex(idx)
  const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false })
  const mesh = new Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)
  const pts = [] // { x, y, z }
  let color = null
  let acc = 0
  const c = new Color()
  return {
    dispose() {
      scene.remove(mesh)
      g.dispose()
      mat.dispose()
    },
    setColor(next) {
      color = next
      mesh.visible = !!next
      pts.length = 0
    },
    update(dt, t, s, bike) {
      if (!color) return
      acc += dt
      const back = -(bike?.userData.length ?? 2) * 0.45
      const px = s.x + Math.sin(s.facing) * back
      const pz = s.z + Math.cos(s.facing) * back
      if (acc > 0.025) {
        acc = 0
        pts.unshift({ x: px, y: s.y, z: pz })
        if (pts.length > N) pts.pop()
      } else if (pts.length) {
        pts[0].x = px
        pts[0].z = pz
        pts[0].y = s.y
      }
      // idle: trail shrinks away
      if (s.speed < 1 && pts.length > 1 && Math.random() < 0.5) pts.pop()
      for (let i = 0; i < N; i++) {
        const p = pts[Math.min(i, pts.length - 1)] ?? { x: px, y: s.y, z: pz }
        const f = 1 - i / (N - 1)
        pos.set([p.x, p.y + 0.25, p.z, p.x, p.y + 0.25 + 0.9 * (0.4 + 0.6 * f), p.z], i * 6)
        if (color === 'rainbow') c.setHSL((t * 0.5 + i / N) % 1, 1, 0.55)
        else c.set(color)
        const k = 2.2 * f
        const a = i < pts.length ? f * 0.9 : 0
        colr.set([c.r * k, c.g * k, c.b * k, a * 0.6, c.r * k, c.g * k, c.b * k, a], i * 8)
      }
      g.attributes.position.needsUpdate = true
      g.attributes.color.needsUpdate = true
    },
  }
}
