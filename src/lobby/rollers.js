// Rolling boulders for World 2 / World 3 — the game's main hazard, the same idea as the hill lane
// (lobby/lane.js): giant half-buried boulders spawn at the far end of the course, roll all the
// way back to the hub gate and flatten anyone on the open course. They carry the same speed sign
// (VERY SLOW .. VERY FAST, the face gets angrier) from the same mode cycle (LANE.boulder.modes).
// The safe spots are the side bays of each island / outpost (where the win pads are).
// The course is flat, so a boulder rolls at a constant pace (base speed x the mode's speed); over a
// gap (the jungle river) it hops across in an arc and lands with a thump.
// opts: { root, pools, audio, wx, wz, lx, ls, kinds, radius, sink, halfWidth, spawnS, baseSpeed,
//         gaps: [[s0, s1], ...], dust: [r, g, b], every (x mode.every), maxAlive }
import { BoxGeometry, Group, Mesh, Vector3 } from 'three'
import { LANE } from '../config.js'
import { bake } from '../bake.js'
import { studMat } from './materials.js'
import { rnd } from './fx.js'
import { BOULDER_LOOKS, boulderSign, buildBoulderModel } from './lane.js'

const AXIS_X = new Vector3(1, 0, 0)

export function createRollers(o) {
  const { root, pools, audio, wx, wz, lx, ls, kinds, radius: R, sink, halfWidth: HW, spawnS, baseSpeed, gaps = [] } = o
  const modes = LANE.boulder.modes
  const FOOT = Math.sqrt(R * R - sink * sink) // half-length where it meets the ground
  const boulders = []
  const debris = []
  const chunkGeo = new BoxGeometry(1, 1, 1)
  const debrisMats = Object.fromEntries(kinds.map((k) => [k, [studMat(BOULDER_LOOKS[k].base, { tile: 1 }), ...BOULDER_LOOKS[k].chunks.slice(0, 2).map((c) => studMat(c, { tile: 1 }))]]))
  let modeIndex = 0
  let modeTimer = modes[0].time
  let spawnTimer = 4
  let lastKind = ''
  const events = []
  const dust = o.dust ?? [0.6, 0.55, 0.45]

  const gapAt = (s) => gaps.find(([a, b]) => s > a && s < b)
  // Hop height over a gap: an arc from lip to lip.
  function hopAt(s) {
    const g = gapAt(s)
    if (!g) return 0
    const u = (s - g[0]) / (g[1] - g[0])
    const peak = 3 + (g[1] - g[0]) * 0.18
    return 4 * peak * u * (1 - u)
  }

  function cloud(x, y, z, big = 1) {
    const w = Math.random() * 0.15
    pools.smoke.spawn({ x, y, z, vx: rnd(-3, 3) * big, vy: rnd(1.5, 4) * big, vz: rnd(-1, 3) * big, life: rnd(1.1, 2), c0: [dust[0] - w, dust[1] - w, dust[2] - w, 0.85], c1: [Math.min(1, dust[0] + 0.25), Math.min(1, dust[1] + 0.25), Math.min(1, dust[2] + 0.25), 0], s0: rnd(2.5, 4) * big, s1: rnd(7, 11) * big, drag: 1.4, wobble: 0.5 })
  }

  function spawn() {
    const mode = modes[modeIndex]
    let kind = kinds[Math.floor(Math.random() * kinds.length)]
    if (kind === lastKind && kinds.length > 1) kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length]
    lastKind = kind
    let b = boulders.find((x) => !x.alive && x.kind === kind)
    if (!b) {
      const model = buildBoulderModel(kind, R)
      const mesh = bake(model, true) // one mesh per material: a few draw calls per boulder
      const spin = new Group()
      spin.add(mesh)
      b = { holder: new Group(), spin, sign: boulderSign(), kind, alive: false }
      b.holder.add(spin, b.sign)
      root.add(b.holder)
      boulders.push(b)
    }
    b.mode = mode
    b.sign.userData.set(mode)
    b.sign.position.y = R + 3.5
    b.holder.visible = true
    b.alive = true
    b.s = spawnS
    b.v = baseSpeed * mode.speed
    b.x = 0
    b.y = 0
    b.wob = rnd(0, 10)
    b.air = false
    b.dustAcc = 0
    b.spin.rotation.set(0, rnd(0, 6), 0)
    audio.boulderSpawn?.()
  }

  function shatter(b) {
    b.alive = false
    b.holder.visible = false
    const y = sink + 2
    const z = wz(0)
    for (let i = 0; i < 16; i++) {
      let d = debris.find((x) => !x.alive)
      if (!d) {
        d = { mesh: new Mesh(chunkGeo, debrisMats[b.kind][0]), alive: false }
        d.mesh.castShadow = true
        root.add(d.mesh)
        debris.push(d)
      }
      d.alive = true
      d.t = 0
      d.mesh.material = debrisMats[b.kind][i % 3]
      d.size = rnd(1, 2.6)
      d.mesh.scale.setScalar(d.size)
      d.mesh.visible = true
      d.mesh.position.set(wx(b.x + rnd(-6, 6)), y + rnd(-2, 4), z + rnd(-4, 2))
      d.v = new Vector3(rnd(-9, 9), rnd(4, 12), rnd(4, 14))
      d.spin = new Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6))
    }
    for (let i = 0; i < 40; i++) cloud(wx(rnd(-FOOT, FOOT)), rnd(0.5, 4), z + rnd(-6, 6), 1.5)
    events.push({ type: 'shatter', at: { x: wx(b.x), y, z } })
  }

  return {
    boulders,
    mode: () => modes[modeIndex].mode,
    // dt, t, player world pos; stopped = Stop Boulders; dashing = the player is on the last stretch
    // (boulders come every LANE.dash.every s). Returns events [{ type: 'thump'|'shatter', ... }].
    update(dt, t, p, stopped, dashing) {
      events.length = 0
      modeTimer -= dt
      if (modeTimer <= 0) {
        modeIndex = (modeIndex + 1) % modes.length
        modeTimer = modes[modeIndex].time
      }
      if (!stopped) {
        spawnTimer -= dt
        if (dashing) spawnTimer = Math.min(spawnTimer, LANE.dash.every)
        if (spawnTimer <= 0 && boulders.filter((b) => b.alive).length < (o.maxAlive ?? 7)) {
          spawnTimer = dashing ? LANE.dash.every : modes[modeIndex].every * (o.every ?? 1) * rnd(0.85, 1.2)
          spawn()
        }
      }
      const ps = ls(p.z)
      for (const b of boulders) {
        if (!b.alive) continue
        b.s -= b.v * dt
        const hop = hopAt(b.s)
        const wasAir = b.air
        b.air = hop > 0.05
        if (wasAir && !b.air) {
          const k = Math.min(1, 0.5 + b.v / 30)
          for (let i = 0; i < 24 * k; i++) cloud(wx(rnd(-FOOT, FOOT) * 0.8), 0.6, wz(b.s + rnd(-FOOT, FOOT) * 0.6), 1.3)
          events.push({ type: 'thump', at: { x: wx(b.x), y: 0, z: wz(b.s) }, strength: k })
        }
        b.x = Math.sin(t * 0.7 + b.wob) * 0.8
        b.holder.position.set(wx(b.x), sink + hop, wz(b.s))
        b.spin.rotateOnWorldAxis(AXIS_X, (b.v / R) * dt)
        b.spin.rotation.z = Math.sin(t * 2.3 + b.wob) * 0.04
        b.sign.userData.face.position.y = 5.6 + Math.sin(t * 3 + b.wob) * 0.5
        // dust boiling off the contact edges (only near the player: the far ones cost nothing)
        if (!b.air && Math.abs(b.s - ps) < 140) {
          b.dustAcc += dt * 22 * Math.min(2, 0.8 + b.v / 18)
          while (b.dustAcc >= 1) {
            b.dustAcc -= 1
            const side = Math.random() < 0.5 ? -1 : 1
            const r = Math.random()
            if (r < 0.4) cloud(wx(side * (HW - rnd(0.5, 3))), rnd(0.5, 3), wz(b.s - FOOT * rnd(0.2, 0.7)), 1.1)
            else cloud(wx(rnd(-HW, HW) * 0.8), 0.4, wz(b.s - FOOT * rnd(0.5, 1)), 0.9)
          }
        }
        if (b.s <= 0) shatter(b)
      }
      for (const d of debris) {
        if (!d.alive) continue
        d.t += dt
        d.v.y -= 22 * dt
        d.mesh.position.addScaledVector(d.v, dt)
        if (d.mesh.position.y < d.size * 0.4) {
          d.mesh.position.y = d.size * 0.4
          d.v.y = Math.abs(d.v.y) * 0.35
          d.v.x *= 0.7
          d.v.z *= 0.7
        }
        d.mesh.rotation.x += d.spin.x * dt
        d.mesh.rotation.y += d.spin.y * dt
        d.mesh.rotation.z += d.spin.z * dt
        if (d.t > 2.4) d.mesh.scale.setScalar(Math.max(0.01, d.size * (1 - (d.t - 2.4) / 0.6)))
        if (d.t > 3) {
          d.alive = false
          d.mesh.visible = false
        }
      }
      return events
    },
    // Flattened right now? (x, s local; safe = in a side bay, |x| beyond the open course)
    crushes(px, py, pz) {
      const x = lx(px)
      const s = ls(pz)
      if (s < -1 || Math.abs(x) > HW - 0.3) return false
      for (const b of boulders) {
        if (!b.alive) continue
        if (Math.abs(s - b.s) < FOOT * 0.8 && py < sink + hopAt(b.s) + R * 0.75 && py > hopAt(b.s) - 6) return true
      }
      return false
    },
    // Distances for the rumble sound / camera shake / dust haze (main.js laneFx).
    nearest(x, y, z) {
      const out = []
      for (const b of boulders) {
        if (!b.alive) continue
        const q = b.holder.position
        out.push({ distance: Math.hypot(q.x - x, q.y - y, q.z - z), speed: b.v, pan: Math.max(-1, Math.min(1, (q.x - x) / 30)) })
      }
      return out
    },
    // The squash pose while flattened (course.fail('crush')).
    crushFail(at) {
      audio.crush?.(0)
      for (let i = 0; i < 50; i++) cloud(at.x + rnd(-2, 2), at.y + 0.4, at.z + rnd(-2, 2), 0.8)
      return { kind: 'crush', update: () => ({ x: at.x, y: at.y, z: at.z, roll: 0, pitch: 0, squash: 0.14 }) }
    },
  }
}
