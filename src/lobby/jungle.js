// World 2: Jungle Jumps. North of the jungle hub's gate a trail of mossy stone islands crosses a
// crocodile river. Each island ends in a wooden ramp; you fly with the speed you have, so the gaps
// (set from JUNGLE.need: riding at MAX need[k] just clears gap k) are the Speed check. Fall short
// and a croc gets you. Swinging spiked logs (low in the middle, high at the sides) and spinning
// spike sweepers (jump them!) guard the higher islands. Every island has a totem pad (+N Wins,
// back to the hub); the last island is the Golden Temple.
// Local frame: x = world x - origin.x, s = m along the course from the gate (world z = origin.z +
// HUB.gateZ - s). Island tops are at y = 0, the river at JUNGLE.riverY.
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Vector3,
} from 'three'
import { HUB, JUNGLE as J, LANE, PHYSICS } from '../config.js'
import { player } from '../player.js'
import { mulberry32 } from '../textures.js'
import { label, neon } from '../propkit.js'
import { studMat } from './materials.js'
import { fireParticle, hdr, rnd, sparkleParticle } from './fx.js'
import { mpsFor } from './lane.js'
import { Batch, SIDES, TAU, batchMaterial, boxCollider, fallMaterial, rng, sign, trimeshCollider, waterMaterial, wedge } from './worldkit.js'
import { createRollers } from './rollers.js'

const G = -PHYSICS.gravity
const HW = J.halfWidth
const rand = mulberry32(5150)
const { R, pick } = rng(rand)

// --- Layout ----------------------------------------------------------------------------------
// Flight distance (m, from the ramp lip to touchdown at island height) at ground speed v.
export function jumpDist(v) {
  const vy = J.launch * v
  return (v * (vy + Math.sqrt(vy * vy + 2 * G * J.ramp.height))) / G
}
// The ground speed that flies exactly d m.
function speedFor(d) {
  let lo = 1
  let hi = 200
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (jumpDist(mid) < d) lo = mid
    else hi = mid
  }
  return lo
}
const islandLen = (k) => (k === 0 ? J.startLen : k === J.need.length ? 62 : J.islandLen + Math.max(0, k - 5) * 5)
export const islands = []
{
  let s = 0
  for (let k = 0; k <= J.need.length; k++) {
    const len = islandLen(k)
    const isl = { k, s0: s, s1: s + len, side: k % 2 ? 1 : -1 }
    islands.push(isl)
    s += len
    if (k < J.need.length) {
      isl.need = J.need[k]
      isl.gap = J.margin * jumpDist(mpsFor(isl.need))
      // In the air over this gap the bike is held to a speed that lands on the next island (no
      // overshooting into the gap after it with a strong bike).
      isl.vcap = speedFor(isl.gap + islandLen(k + 1) * 0.5)
      s += isl.gap
    }
  }
}
const temple = islands[islands.length - 1]
export const courseLength = temple.s1
const islandAt = (s) => islands.find((i) => s >= i.s0 - 0.01 && s <= i.s1 + 0.01)
// The island you're on or flying from (gaps belong to the island before them).
const lastIslandAt = (s) => {
  let out = islands[0]
  for (const i of islands) if (s >= i.s0 - 0.5) out = i
  return out
}

// Pads on islands 1..10 and the temple.
for (const isl of islands) {
  if (isl.k === 0) continue
  if (isl === temple) isl.pad = { x: 0, s: isl.s0 + 18, wins: J.summitWins, summit: true }
  else isl.pad = { x: isl.side * (HW + J.bay.depth / 2), s: isl.s0 + J.bay.from + J.bay.len / 2, wins: J.padWins[isl.k - 1] }
}
// Safe caves (boulder shelters, like the hill's): a cave in the side of every island but the
// temple, on the pad's side; the boulders only fill the open island (|x| < halfWidth).
for (const isl of islands) {
  if (isl !== temple) isl.bay = { side: isl.side, s0: isl.s0 + J.bay.from, s1: isl.s0 + J.bay.from + J.bay.len }
}
// Hazards per island.
for (const isl of islands) {
  if (isl.k === 0 || isl === temple) continue
  const span = J.need.length - 1
  const f = (isl.k - 1) / span
  isl.sweeper = isl.k >= J.sweepers.from ? { s: isl.s0 + 17, speed: J.sweepers.speed[0] + (J.sweepers.speed[1] - J.sweepers.speed[0]) * f, dir: isl.k % 2 ? 1 : -1, a: rand() * TAU } : null
  isl.log = isl.k >= J.logs.from && (isl.k < J.sweepers.from || isl.k >= 6) ? { s: isl.s1 - J.ramp.len - 4.5, period: J.logs.period[0] + (J.logs.period[1] - J.logs.period[0]) * f, phase: rand() * TAU } : null
}

// =============================================================================================
export function buildJungle(scene, pools, audio = {}, origin = { x: 0, z: 0 }) {
  const root = new Group()
  root.name = 'jungle'
  scene.add(root)
  const OX = origin.x
  const OZ = origin.z + HUB.gateZ
  const wx = (x) => OX + x
  const wz = (s) => OZ - s
  const lx = (x) => x - OX
  const ls = (z) => OZ - z
  const L = courseLength
  const timers = [] // shader materials with a time uniform

  // --- River, banks, canyon ------------------------------------------------------------------
  const water = waterMaterial({ flow: [0, 1.2] })
  timers.push(water)
  const river = new Mesh(new PlaneGeometry(200, L + 220), water)
  river.rotation.x = -Math.PI / 2
  river.position.set(wx(0), J.riverY, wz(L / 2 + 60))
  root.add(river)
  // Deep riverbed so you never see under the water.
  const bed = new Mesh(new PlaneGeometry(200, L + 220), new MeshStandardMaterial({ color: '#0a3a30', roughness: 1 }))
  bed.rotation.x = -Math.PI / 2
  bed.position.set(wx(0), J.riverY - 6, wz(L / 2 + 60))
  root.add(bed)

  const CELL = 6
  const cols = []
  for (let s = -10; s < L + 120; s += CELL) {
    for (const side of SIDES) {
      for (let k = 0; k < 4; k++) {
        const x = side * (54 + k * CELL + (rand() < 0.3 ? R(-1.5, 1.5) : 0))
        const h = R(8, 14) + k * R(5, 9) + (s > L + 30 ? 18 : 0)
        cols.push({ x, s, h, k })
      }
    }
  }
  // Far wall across the north end behind the temple (the big waterfall pours over it).
  for (let x = -54; x <= 54; x += CELL) for (let k = 0; k < 3; k++) cols.push({ x, s: L + 70 + k * CELL, h: R(40, 52) + k * 6, k: 3 })
  {
    const box = new BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const m = new Matrix4()
    const q = new Quaternion()
    const tint = new Color()
    const stone = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.85 }), cols.length)
    const caps = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.7 }), cols.length)
    cols.forEach((c, i) => {
      const base = J.riverY - 4
      stone.setMatrixAt(i, m.compose(new Vector3(wx(c.x), base, wz(c.s)), q, new Vector3(CELL + 0.05, c.h - base, CELL + 0.05)))
      stone.setColorAt(i, tint.set(c.k < 1 ? '#6f7c5a' : '#7f8a6a').offsetHSL(R(-0.02, 0.02), R(-0.05, 0.05), R(-0.06, 0.04)))
      caps.setMatrixAt(i, m.compose(new Vector3(wx(c.x), c.h, wz(c.s)), q, new Vector3(CELL + 0.4, 0.8, CELL + 0.4)))
      caps.setColorAt(i, tint.set(pick(['#4fc23a', '#5fd13a', '#3fa832'])).offsetHSL(0, 0, R(-0.04, 0.04)))
    })
    stone.castShadow = stone.receiveShadow = caps.receiveShadow = true
    root.add(stone, caps)
    // Vine curtains down the inner wall faces.
    const vineSpots = cols.filter((c) => c.k === 0 && rand() < 0.55)
    const vines = new InstancedMesh(new BoxGeometry(0.22, 1, 0.22), studMat('#3fbf3f', { tile: 0.8 }), vineSpots.length * 6)
    const tmp = new Object3D()
    vineSpots.forEach((c, i) => {
      for (let k = 0; k < 6; k++) {
        const len = R(3, Math.min(14, c.h - J.riverY - 1))
        tmp.position.set(wx(c.x - Math.sign(c.x) * (CELL / 2 + 0.15)), c.h - len / 2, wz(c.s + R(-CELL / 2, CELL / 2)))
        tmp.scale.set(1, len, 1)
        tmp.updateMatrix()
        vines.setMatrixAt(i * 6 + k, tmp.matrix)
      }
    })
    root.add(vines)
    // Jungle trees on the rim and the terraces: trunks + layered canopy blocks + palms.
    const tops = cols.filter((c) => c.k >= 1 && rand() < 0.45)
    const trunkGeo = new CylinderGeometry(0.45, 0.75, 1, 7)
    trunkGeo.translate(0, 0.5, 0)
    const trunks = new InstancedMesh(trunkGeo, studMat('#7a4a26', { tile: 1.4 }), tops.length)
    const leaves = new InstancedMesh(new BoxGeometry(1, 1, 1), studMat('#ffffff', { tile: 1.5, roughness: 0.6 }), tops.length * 6)
    const greens = ['#2e9a34', '#3fbf3f', '#1f7a2a', '#5bd64a', '#4aa83a']
    tops.forEach((c, i) => {
      const h = R(8, 15)
      const x = wx(c.x + R(-1.5, 1.5))
      const z = wz(c.s + R(-1.5, 1.5))
      tmp.position.set(x, c.h + 0.5, z)
      tmp.rotation.set(R(-0.1, 0.1), 0, R(-0.1, 0.1))
      tmp.scale.set(1, h, 1)
      tmp.updateMatrix()
      trunks.setMatrixAt(i, tmp.matrix)
      for (let k = 0; k < 6; k++) {
        const tier = k < 3 ? 0 : 1
        tmp.position.set(x + R(-2.6, 2.6), c.h + h + tier * 2.2 + R(-0.8, 0.8), z + R(-2.6, 2.6))
        tmp.rotation.set(0, R(0, 3), 0)
        tmp.scale.set(R(3.5, 5.5) * (tier ? 0.7 : 1), R(1.6, 2.4), R(3.5, 5.5) * (tier ? 0.7 : 1))
        tmp.updateMatrix()
        leaves.setMatrixAt(i * 6 + k, tmp.matrix)
        leaves.setColorAt(i * 6 + k, tint.set(pick(greens)))
      }
    })
    trunks.castShadow = leaves.castShadow = true
    root.add(trunks, leaves)
  }

  // Rocks, reeds and lily pads in the river.
  {
    const b = new Batch()
    const lilies = new Batch()
    for (let i = 0; i < 90; i++) {
      const s = R(-5, L + 60)
      const side = rand() < 0.5 ? -1 : 1
      const x = side * R(HW + 4, 50)
      b.rock(R(1, 3.2), pick(['#7d8478', '#8f9688', '#6a7266']), wx(x), J.riverY + R(-0.4, 0.5), wz(s), R(1, 1.6), R(0.5, 0.9), R(1, 1.5), R(0, 3))
      if (rand() < 0.4) for (let k = 0; k < 5; k++) b.box(0.12, R(1.2, 2.4), 0.12, '#5fa83a', wx(x + R(-1.5, 1.5)), J.riverY + 0.8, wz(s + R(-1.5, 1.5)), R(-0.2, 0.2), 0, R(-0.2, 0.2))
    }
    for (let i = 0; i < 140; i++) {
      const s = R(-5, L + 40)
      const x = (rand() < 0.5 ? -1 : 1) * R(HW + 2, 48)
      const r = R(0.5, 1.1)
      lilies.cyl(r, 0.08, pick(['#3fbf3f', '#5fd13a', '#2e9a34']), wx(x), J.riverY + 0.05, wz(s), 0, R(0, 3), 0, 9)
      if (rand() < 0.2) lilies.ball(0.22, pick(['#ff7ab0', '#ffffff', '#ffd21f']), wx(x), J.riverY + 0.2, wz(s), 1, 0.6, 1)
    }
    root.add(b.build(batchMaterial(true)), lilies.build(batchMaterial(false), false))
  }

  // Waterfalls: one huge one over the far wall, smaller ones down the canyon walls.
  const falls = []
  function waterfall(x, s, top, width, face = 0) {
    const mat = fallMaterial([0.72, 0.95, 1.0], [1.7, 1.9, 2.0], 1.6)
    timers.push(mat)
    const h = top - J.riverY
    const sheet = new Mesh(new PlaneGeometry(width, h), mat)
    sheet.position.set(wx(x), J.riverY + h / 2, wz(s))
    sheet.rotation.y = face
    root.add(sheet)
    falls.push({ x, s, width })
    pools.smoke.addEmitter({
      rate: 10 + width,
      make: () => ({ x: wx(x + rnd(-width / 2, width / 2) * Math.cos(face)), y: J.riverY + 0.5, z: wz(s + rnd(-width / 2, width / 2) * Math.sin(face)), vx: rnd(-2, 2), vy: rnd(1, 3.5), vz: rnd(-2, 2), life: rnd(1.4, 2.6), c0: [0.92, 0.98, 1, 0.55], c1: [1, 1, 1, 0], s0: rnd(2, 4), s1: rnd(6, 11), drag: 1.2 }),
    })
  }
  waterfall(0, L + 66.5, 52, 46)
  waterfall(-51, L * 0.3, 22, 10, Math.PI / 2)
  waterfall(51, L * 0.62, 26, 12, -Math.PI / 2)
  waterfall(-51, L * 0.86, 30, 9, Math.PI / 2)

  // --- Islands -----------------------------------------------------------------------------------
  const islandBatch = new Batch()
  const hedgeBatch = new Batch()
  const torchFires = []
  const greenTop = studMat('#6fd13a', { roughness: 0.75 })
  const stoneSide = studMat('#8a9478', { roughness: 0.85, tile: 1.4 })
  for (const isl of islands) {
    const len = isl.s1 - isl.s0
    const sc = (isl.s0 + isl.s1) / 2
    const body = new Mesh(new BoxGeometry(HW * 2, 16, len), stoneSide)
    body.position.set(wx(0), -8.6, wz(sc))
    body.receiveShadow = body.castShadow = true
    const top = new Mesh(new BoxGeometry(HW * 2 + 0.4, 0.6, len + 0.4), isl === temple ? studMat('#d9c690', { roughness: 0.7 }) : greenTop)
    top.position.set(wx(0), -0.3, wz(sc))
    top.receiveShadow = true
    root.add(body, top)
    boxCollider(HW, 8, len / 2, wx(0), -8, wz(sc))
    // dirt rim, moss streaks and hanging roots down the sides
    for (const side of SIDES) {
      islandBatch.box(0.5, 0.9, len + 0.5, '#7a5a3a', wx(side * (HW + 0.05)), -0.9, wz(sc))
      for (let i = 0; i < len / 3; i++) {
        const ss = isl.s0 + R(1, len - 1)
        const h = R(1.2, 4.5)
        islandBatch.box(0.3, h, R(0.6, 1.6), pick(['#4fa83a', '#3fbf3f', '#6a8a3a']), wx(side * (HW + 0.16)), -0.6 - h / 2, wz(ss))
      }
      // hedge wall along the side (stops you riding off), with a collider
      const bay = isl.bay && isl.bay.side === side ? isl.bay : null
      for (let ss = isl.s0 + 1; ss < isl.s1 - 0.5; ss += 1.6) {
        if (bay && ss > bay.s0 - 0.6 && ss < bay.s1 + 0.6) continue
        hedgeBatch.box(1.3, R(0.9, 1.3), 1.9, pick(['#2e9a34', '#3fbf3f', '#2a8a30']), wx(side * (HW - 0.65)), 0.5, wz(ss), 0, R(-0.2, 0.2), 0)
      }
      const spans = bay ? [[isl.s0 + 0.6, bay.s0], [bay.s1, isl.s1 - 0.6]] : [[isl.s0 + 0.6, isl.s1 - 0.6]]
      for (const [a, c] of spans) if (c - a > 0.2) boxCollider(0.6, 0.6, (c - a) / 2, wx(side * (HW - 0.65)), 0.6, wz((a + c) / 2))
      if (bay) {
        // the cave floor: a grassy ledge sticking out over the river, hedged at the back
        const D = J.bay.depth
        const bs = (bay.s0 + bay.s1) / 2
        const bl = bay.s1 - bay.s0
        const ledge = new Mesh(new BoxGeometry(D, 14, bl), stoneSide)
        ledge.position.set(wx(side * (HW + D / 2)), -7.6, wz(bs))
        ledge.castShadow = ledge.receiveShadow = true
        const ltop = new Mesh(new BoxGeometry(D + 0.3, 0.6, bl + 0.3), greenTop)
        ltop.position.set(wx(side * (HW + D / 2)), -0.3, wz(bs))
        ltop.receiveShadow = true
        root.add(ledge, ltop)
        boxCollider(D / 2, 7, bl / 2, wx(side * (HW + D / 2)), -7, wz(bs))
        for (let ss = bay.s0 + 0.8; ss < bay.s1; ss += 1.6) hedgeBatch.box(1.2, R(1, 1.4), 1.8, pick(['#2e9a34', '#3fbf3f']), wx(side * (HW + D - 0.6)), 0.55, wz(ss), 0, R(-0.2, 0.2), 0)
        boxCollider(0.6, 0.7, bl / 2, wx(side * (HW + D - 0.6)), 0.7, wz(bs))
        for (const end of [bay.s0 + 0.6, bay.s1 - 0.6]) {
          for (let x = HW + 0.6; x < HW + D - 0.6; x += 1.6) hedgeBatch.box(1.8, R(1, 1.3), 1.2, pick(['#2e9a34', '#3fbf3f']), wx(side * x), 0.55, wz(end), 0, R(-0.2, 0.2), 0)
          boxCollider(D / 2, 0.7, 0.6, wx(side * (HW + D / 2)), 0.7, wz(end))
        }
        // the cave: mossy rock back wall, jambs, a roof slab with a grass cap, hanging rocks + vines
        const rock = ['#6f7c5a', '#5d6a4c', '#7f8a6a']
        islandBatch.box(1.6, 9, bl + 2.4, '#4a5240', wx(side * (HW + D + 0.4)), 3.5, wz(bs))
        boxCollider(0.8, 5, bl / 2 + 1, wx(side * (HW + D + 0.4)), 4, wz(bs)) // tall back wall: keeps the camera inside
        for (const end of [bay.s0 - 0.4, bay.s1 + 0.4]) islandBatch.box(D + 1, 9.5, 1.6, rock[0], wx(side * (HW + D / 2)), 3.7, wz(end))
        islandBatch.box(D + 2.4, 3, bl + 3.4, rock[2], wx(side * (HW + D / 2 + 0.3)), 9.5, wz(bs))
        islandBatch.box(D + 2.7, 0.6, bl + 3.7, '#5fd13a', wx(side * (HW + D / 2 + 0.3)), 11.2, wz(bs))
        islandBatch.box(D, 0.4, bl, '#3a4232', wx(side * (HW + D / 2)), 7.9, wz(bs))
        for (let i = 0; i < 22; i++) {
          const h = R(0.8, 2.6)
          islandBatch.box(R(0.8, 2), h, R(0.8, 1.8), rock[i % 3], wx(side * (HW + R(0.4, D - 0.4))), 7.9 - h / 2, wz(R(bay.s0 + 0.5, bay.s1 - 0.5)))
        }
        for (let i = 0; i < 12; i++) {
          const h = R(1.5, 4)
          islandBatch.box(0.22, h, 0.22, '#3fbf3f', wx(side * (HW + R(0.1, 0.8))), 8 - h / 2, wz(R(bay.s0 + 0.5, bay.s1 - 0.5)))
        }
        for (let i = 0; i < 4; i++) islandBatch.ball(R(0.3, 0.5), '#7fffe0', wx(side * (HW + D - 1.2)), 0.4, wz(bs + R(-3, 3)), 1, 0.55, 1)
      }
    }
    // end hedge beside the ramp (only the ramp leads on)
    if (isl !== temple) {
      for (const side of SIDES) {
        const a = J.ramp.halfWidth + 0.3
        const w = HW - a
        for (let x = a + 0.8; x < HW - 0.6; x += 1.6) hedgeBatch.box(1.8, R(0.9, 1.3), 1.3, pick(['#2e9a34', '#3fbf3f']), wx(side * x), 0.5, wz(isl.s1 - 0.65), 0, R(-0.2, 0.2), 0)
        boxCollider(w / 2, 0.6, 0.6, wx(side * (a + w / 2)), 0.6, wz(isl.s1 - 0.65))
      }
    }
    // tiki torches on the landing corners
    if (isl.k > 0) {
      for (const side of SIDES) {
        const x = side * (HW - 1.2)
        const s = isl.s0 + 1.4
        islandBatch.cyl(0.18, 2.6, '#8a5530', wx(x), 1.3, wz(s), 0, 0, 0, 6)
        islandBatch.cyl(0.42, 0.5, '#5a3a20', wx(x), 2.75, wz(s), 0, 0, 0, 8, 0.3)
        torchFires.push([wx(x), 3.1, wz(s)])
      }
    }
    // Grass tufts + flowers on top.
    for (let i = 0; i < len / 2.5; i++) {
      const x = R(-HW + 1.6, HW - 1.6)
      const s = R(isl.s0 + 1, isl.s1 - J.ramp.len - 1)
      if (Math.abs(x) < 5 && rand() < 0.6) continue // keep the racing line clean-ish
      islandBatch.box(0.18, R(0.4, 0.8), 0.18, '#58d43a', wx(x), 0.3, wz(s), R(-0.3, 0.3), 0, R(-0.3, 0.3))
      if (rand() < 0.3) islandBatch.box(0.4, 0.08, 0.4, pick(['#ffe14a', '#ff4d6d', '#ffffff', '#ff9a1f']), wx(x), 0.62, wz(s), 0, R(0, 1), 0)
    }
  }
  root.add(islandBatch.build(batchMaterial(true)), hedgeBatch.build(batchMaterial(true)))
  pools.fire.addEmitter({ rate: torchFires.length * 5, make: () => { const [x, y, z] = pick(torchFires); return fireParticle(x, y, z, 0.45) } })

  // --- Ramps ---------------------------------------------------------------------------------------
  const rampBatch = new Batch()
  const rw = J.ramp.halfWidth
  for (const isl of islands) {
    if (isl === temple) continue
    const lip = isl.s1
    const s0 = lip - J.ramp.len
    // collider: a wedge (low end at s0, lip at s1) in world space
    const w = wedge(wx(-rw), wx(rw), 0, wz(s0), wz(lip), J.ramp.height)
    trimeshCollider(w.positions, w.indices)
    const ang = Math.atan2(J.ramp.height, J.ramp.len)
    const slopeLen = Math.hypot(J.ramp.height, J.ramp.len)
    const midY = J.ramp.height / 2
    // plank deck (alternating browns) + chevrons + side rails + support posts
    const n = 9
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const s = s0 + t * J.ramp.len
      rampBatch.box(rw * 2, 0.22, slopeLen / n - 0.08, i % 2 ? '#b07a42' : '#9a6634', wx(0), t * J.ramp.height + 0.02, wz(s), ang, 0, 0)
    }
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.25
      const s = s0 + t * J.ramp.len
      for (const side of SIDES) rampBatch.box(2.2, 0.06, 0.7, '#ffd21f', wx(side * 1.1), t * J.ramp.height + 0.16, wz(s), ang, 0, side * 0.6)
    }
    for (const side of SIDES) {
      rampBatch.box(0.5, 0.5, slopeLen, '#6a4422', wx(side * (rw + 0.25)), midY + 0.3, wz(s0 + J.ramp.len / 2), ang, 0, 0)
      rampBatch.box(0.4, J.ramp.height, 0.4, '#5a3a1e', wx(side * (rw - 0.4)), J.ramp.height / 2, wz(lip - 0.3))
    }
    rampBatch.box(rw * 2, J.ramp.height, 0.3, '#5a3a1e', wx(0), J.ramp.height / 2, wz(lip - 0.12))
    // "JUMP!" sign over the ramp: the MAX that clears this gap
    sign(root, wx(0), J.ramp.height + 6.4, wz(s0 - 2), [
      { text: `JUMP! MAX ${isl.need}`, size: 1.5, color: '#ffd21f' },
      { text: `${Math.round(isl.gap)} m gap`, size: 0.85, color: '#ffffff' },
    ])
  }
  root.add(rampBatch.build(batchMaterial(true)))

  // --- Totem pads + the Golden Temple ---------------------------------------------------------------
  const padRings = []
  const totems = new Batch()
  for (const isl of islands) {
    if (!isl.pad) continue
    const p = isl.pad
    if (p.summit) continue
    const color = isl.k % 2 ? '#ffe11f' : '#ff7a1f'
    const pad = new Mesh(new BoxGeometry(5, 0.28, 4.4), studMat(color, { emissive: color, emissiveIntensity: 0.35, tile: 1 }))
    pad.position.set(wx(p.x), 0.14, wz(p.s))
    root.add(pad)
    padRings.push(pad)
    // totem pole behind the pad: stacked carved faces
    const tx = wx(isl.side * (HW + J.bay.depth - 2))
    const tz = wz(isl.bay.s1 - 2)
    const faces = ['#c4572a', '#2fa8c4', '#ffd21f', '#5fd13a']
    for (let i = 0; i < 4; i++) {
      const y = 0.9 + i * 1.5
      totems.box(1.4, 1.4, 1.4, faces[(i + isl.k) % 4], tx, y, tz)
      totems.box(0.3, 0.3, 0.1, '#ffffff', tx - 0.35, y + 0.25, tz - 0.72)
      totems.box(0.3, 0.3, 0.1, '#ffffff', tx + 0.35, y + 0.25, tz - 0.72)
      totems.box(0.14, 0.14, 0.12, '#1d1238', tx - 0.35, y + 0.25, tz - 0.76)
      totems.box(0.14, 0.14, 0.12, '#1d1238', tx + 0.35, y + 0.25, tz - 0.76)
      totems.box(0.8, 0.2, 0.1, '#1d1238', tx, y - 0.35, tz - 0.72)
    }
    totems.box(3.6, 0.3, 0.6, '#c4572a', tx, 5.4, tz) // wings on top
    boxCollider(0.75, 3.2, 0.75, tx, 3.2, tz)
    const tag = new Group()
    const l1 = label(`+${p.wins.toLocaleString('en-US')} WINS`, 1.1, { color: '#ffd21f', outline: '#3a1a00', outlineWidth: 14 })
    const l2 = label('Return', 0.7, { color: '#ffffff', outline: '#14112b', outlineWidth: 10 })
    l2.position.y = -0.9
    const l0 = label(`CAVE ${isl.k} · x${J.train[isl.k]} SPEED`, 0.75, { color: '#9dff7a', outline: '#0b2a10', outlineWidth: 10 })
    l0.position.y = 1.05
    tag.add(l0, l1, l2)
    tag.position.set(wx(p.x), 4, wz(p.s))
    root.add(tag)
  }
  root.add(totems.build(batchMaterial(true)))

  // The Golden Temple: a stepped pyramid with a shrine and a glowing idol, braziers each side.
  const idol = new Group()
  {
    const b = new Batch()
    const ts = temple.s1 - 18
    const stone = ['#d9c690', '#cdb87e', '#e4d4a2']
    for (let i = 0; i < 7; i++) {
      const w = 34 - i * 4.2
      const d = 30 - i * 3.6
      b.box(w, 3, d, stone[i % 3], wx(0), 1.5 + i * 3, wz(ts))
      b.box(w + 0.3, 0.4, d + 0.3, '#7fd43a', wx(0), 3 + i * 3, wz(ts)) // mossy ledges
    }
    // front staircase
    for (let i = 0; i < 14; i++) b.box(6, 1.5, 1.6, '#e4d4a2', wx(0), 0.75 + i * 1.5, wz(ts - 15 + i * 1.08))
    // shrine on top
    const top = 21
    b.box(8, 6, 7, '#cdb87e', wx(0), top + 3, wz(ts))
    b.box(9.4, 1, 8.4, '#ffd21f', wx(0), top + 6.5, wz(ts))
    b.box(3, 4, 0.4, '#1d1238', wx(0), top + 2, wz(ts - 3.55))
    for (const side of SIDES) b.box(1.2, 6, 1.2, '#ffd21f', wx(side * 3.4), top + 3, wz(ts - 3.6))
    // vines over the steps
    for (let i = 0; i < 40; i++) {
      const lvl = Math.floor(rand() * 6)
      const w = 34 - lvl * 4.2
      const len = R(1, 3)
      b.box(0.25, len, 0.25, '#3fbf3f', wx(R(-w / 2, w / 2)), 3 + lvl * 3 - len / 2, wz(ts - (30 - lvl * 3.6) / 2 - 0.15))
    }
    // braziers
    for (const side of SIDES) {
      b.cyl(0.6, 3, '#8a7a5a', wx(side * 9.5), 1.5, wz(temple.s0 + 23), 0, 0, 0, 8)
      b.cyl(1.3, 0.8, '#ffd21f', wx(side * 9.5), 3.3, wz(temple.s0 + 23), 0, 0, 0, 10, 1.6)
    }
    root.add(b.build(batchMaterial(true)))
    boxCollider(17, 12, 15, wx(0), 10, wz(ts))
    for (const side of SIDES) {
      boxCollider(0.7, 2, 0.7, wx(side * 9.5), 2, wz(temple.s0 + 23))
      const fx = wx(side * 9.5)
      const fz = wz(temple.s0 + 23)
      pools.fire.addEmitter({ rate: 40, make: () => fireParticle(fx + rnd(-0.8, 0.8), 3.8, fz + rnd(-0.8, 0.8), 1.2) })
    }
    // golden idol in the shrine doorway (a chunky monkey-king statue)
    const gold = new MeshStandardMaterial({ color: '#ffc531', roughness: 0.25, metalness: 0.85, emissive: '#7a4a00', emissiveIntensity: 0.4 })
    const add = (geo, x, y, z) => {
      const m = new Mesh(geo, gold)
      m.position.set(x, y, z)
      m.castShadow = true
      idol.add(m)
    }
    add(new BoxGeometry(2.2, 2.4, 1.6), 0, 1.2, 0)
    add(new BoxGeometry(1.8, 1.6, 1.6), 0, 3.2, 0)
    for (const side of SIDES) add(new BoxGeometry(0.8, 0.8, 0.4), side * 1.1, 3.6, 0)
    const eye = neon('#5dff4a', 4)
    for (const side of SIDES) {
      const e = new Mesh(new BoxGeometry(0.32, 0.32, 0.1), eye)
      e.position.set(side * 0.4, 3.4, -0.82)
      idol.add(e)
    }
    idol.position.set(wx(0), top + 0.2, wz(ts - 3.2))
    idol.rotation.y = Math.PI
    root.add(idol)
    const shine = new PointLight('#ffd23a', 40, 30, 1.6)
    shine.position.set(wx(0), top + 4, wz(ts - 6))
    root.add(shine)
    pools.glow.addEmitter({ rate: 14, make: () => sparkleParticle(wx(0), top + 2, wz(ts - 4), '#ffd23a', 2.4) })
    // summit pad
    const sp = temple.pad
    const pad = new Mesh(new BoxGeometry(14, 0.3, 6), studMat('#ffd21f', { emissive: '#ffb020', emissiveIntensity: 0.45, tile: 1 }))
    pad.position.set(wx(sp.x), 0.15, wz(sp.s))
    root.add(pad)
    padRings.push(pad)
    sign(root, wx(0), 9, wz(sp.s), [
      { text: `🏆 GOLDEN TEMPLE +${J.summitWins.toLocaleString('en-US')} WINS`, size: 1.9, color: '#ffd21f', outline: '#3a1a00' },
      { text: `x${J.summitTrain} SPEED`, size: 1.1, color: '#9dff7a', outline: '#0b2a10' },
    ])
  }

  // --- Swinging logs -------------------------------------------------------------------------------
  const logs = []
  {
    const frame = new Batch()
    const logMat = batchMaterial(true)
    for (const isl of islands) {
      if (!isl.log) continue
      const lg = isl.log
      const P = J.logs.pivot
      // A-frame posts on rocks in the river + crossbeam
      for (const side of SIDES) {
        const x = side * (HW + 2.2)
        frame.rock(2.4, '#7d8478', wx(x), J.riverY + 0.5, wz(lg.s), 1.2, 1, 1.2)
        frame.bar([wx(x), J.riverY + 1, wz(lg.s - 2.5)], [wx(x), P + 0.5, wz(lg.s)], 0.7, '#7a4a26')
        frame.bar([wx(x), J.riverY + 1, wz(lg.s + 2.5)], [wx(x), P + 0.5, wz(lg.s)], 0.7, '#7a4a26')
      }
      frame.box((HW + 2.2) * 2 + 1.2, 0.9, 0.9, '#6a3e20', wx(0), P + 0.6, wz(lg.s))
      for (let i = -3; i <= 3; i++) frame.box(0.5, 0.5, 1.2, '#3fbf3f', wx(i * 3.2), P + 1.2, wz(lg.s)) // leaves on the beam
      // the log: trunk along s with bark rings and spikes
      const b = new Batch()
      const len = 5
      b.cyl(J.logs.radius, len, '#8a5530', 0, 0, 0, Math.PI / 2, 0, 0, 10)
      for (const z of [-2.2, 0, 2.2]) b.cyl(J.logs.radius + 0.08, 0.3, '#5a3418', 0, 0, z, Math.PI / 2, 0, 0, 10)
      for (let i = 0; i < 14; i++) {
        const a = (i / 7) * TAU
        const z = i < 7 ? -1.1 : 1.1
        b.cone(0.28, 0.9, '#e8e2d0', Math.cos(a) * (J.logs.radius + 0.35), Math.sin(a) * (J.logs.radius + 0.35), z, 0, 0, a - Math.PI / 2, 5)
      }
      // ropes up to the pivot
      const rope = new Batch()
      for (const z of [-1.8, 1.8]) rope.box(0.16, 1, 0.16, '#d9c690', 0, 0.5, z)
      const pend = new Group()
      pend.position.set(wx(0), P, wz(lg.s))
      const swing = new Group()
      pend.add(swing)
      const ropes = rope.build(logMat, false)
      ropes.scale.y = J.logs.length
      ropes.position.y = -J.logs.length
      const logMesh = b.build(logMat)
      logMesh.position.y = -J.logs.length
      swing.add(ropes, logMesh)
      root.add(pend)
      logs.push({ isl, lg, swing, angle: 0, x: 0, y: 0, prev: 0, whoosh: 0 })
    }
    root.add(frame.build(batchMaterial(true)))
  }

  // --- Spinning spike sweepers ----------------------------------------------------------------------
  const sweepers = []
  for (const isl of islands) {
    if (!isl.sweeper) continue
    const sw = isl.sweeper
    const post = new Batch()
    post.cyl(1.1, 0.5, '#5a3a1e', wx(0), 0.25, wz(sw.s), 0, 0, 0, 10)
    const faces = ['#c4572a', '#2fa8c4', '#ffd21f']
    for (let i = 0; i < 3; i++) {
      const y = 1 + i * 1.4
      post.box(1.4, 1.3, 1.4, faces[i], wx(0), y, wz(sw.s))
      for (const side of SIDES) post.box(0.3, 0.3, 0.1, '#ffffff', wx(side * 0.35), y + 0.2, wz(sw.s - 0.72))
    }
    root.add(post.build(batchMaterial(true)))
    boxCollider(0.85, 2.4, 0.85, wx(0), 2.4, wz(sw.s))
    const arm = new Batch()
    const r = J.sweepers.radius
    arm.cyl(0.45, r * 2, '#8a5530', 0, 0, 0, 0, 0, Math.PI / 2, 8)
    for (let i = 0; i < 18; i++) {
      const x = -r + 0.8 + (i / 17) * (r * 2 - 1.6)
      if (Math.abs(x) < 1.2) continue
      const a = (i % 3) * (TAU / 3)
      arm.cone(0.16, 0.6, '#e8e2d0', x, Math.cos(a) * 0.55, Math.sin(a) * 0.55, a, 0, 0, 4)
    }
    for (const side of SIDES) arm.ball(0.7, '#ffd21f', side * r, 0, 0)
    const spin = arm.build(batchMaterial(true))
    spin.position.set(wx(0), J.sweepers.height, wz(sw.s))
    root.add(spin)
    sweepers.push({ isl, sw, spin })
  }

  // --- Crocodiles ---------------------------------------------------------------------------------
  function buildCroc() {
    const g = new Group()
    const upper = new Batch()
    const C = '#3f7a2a'
    const D = '#2a5a1e'
    const belly = '#c8d68a'
    upper.box(1.6, 0.7, 2.8, C, 0, 0, 0)
    upper.box(1.3, 0.55, 1.4, C, 0, 0.05, 1.9) // neck/head
    upper.box(1.0, 0.36, 1.6, C, 0, 0.12, 3.25) // snout top
    for (const side of SIDES) {
      upper.box(0.42, 0.42, 0.42, D, side * 0.42, 0.42, 2.25) // eye bumps
      upper.box(0.26, 0.28, 0.1, '#ffe14a', side * 0.42, 0.46, 2.47)
      upper.box(0.1, 0.24, 0.12, '#14112b', side * 0.42, 0.46, 2.52)
      for (let i = 0; i < 4; i++) upper.cone(0.06, 0.2, '#ffffff', side * 0.44, -0.1, 2.6 + i * 0.38, Math.PI, 0, 0, 4) // top teeth
      upper.box(0.4, 0.3, 0.9, D, side * 0.85, -0.25, 0.9) // legs
      upper.box(0.4, 0.3, 0.9, D, side * 0.85, -0.25, -0.9)
    }
    for (let i = 0; i < 6; i++) upper.box(0.34, 0.26, 0.34, D, 0, 0.44, 1.2 - i * 0.6) // back ridges
    upper.box(1.0, 0.5, 1.8, C, 0, -0.05, -2.2)
    upper.box(0.6, 0.36, 1.8, C, 0, -0.08, -3.8)
    for (let i = 0; i < 4; i++) upper.box(0.22, 0.2, 0.22, D, 0, 0.26, -1.8 - i * 0.7)
    const top = upper.build(batchMaterial(false))
    g.add(top)
    const jaw = new Group()
    jaw.position.set(0, -0.12, 2.3)
    const lower = new Batch()
    lower.box(0.95, 0.24, 1.7, belly, 0, -0.12, 0.85)
    lower.box(0.85, 0.06, 1.5, '#ff7a8a', 0, 0.02, 0.8)
    for (const side of SIDES) for (let i = 0; i < 4; i++) lower.cone(0.06, 0.2, '#ffffff', side * 0.38, 0.1, 0.3 + i * 0.38, 0, 0, 0, 4)
    jaw.add(lower.build(batchMaterial(false)))
    g.add(jaw)
    g.userData.jaw = jaw
    return g
  }
  const crocs = []
  for (let i = 0; i < J.crocs; i++) {
    const isl = islands[i % (islands.length - 1)]
    const m = buildCroc()
    m.scale.setScalar(rnd(1.1, 1.5))
    root.add(m)
    const gc = isl.s1 + isl.gap / 2
    crocs.push({ m, isl, home: { x: R(-HW - 14, HW + 14), s: gc }, x: 0, s: gc, yaw: R(0, TAU), phase: R(0, TAU), speed: R(1.2, 2.4), state: 'swim', t: 0, target: null })
  }

  // --- Ambient life: butterflies, fireflies, mist over the gaps, birds ----------------------------
  pools.glow.addEmitter({ rate: 10, make: () => { const isl = pick(islands); return { ...sparkleParticle(wx(R(-HW, HW)), R(0.6, 3), wz(R(isl.s0, isl.s1)), pick(['#ffd21f', '#ff7ab0', '#7fe0ff', '#c8ff5a']), 0.4), vx: rnd(-1, 1), vy: rnd(-0.2, 0.6), vz: rnd(-1, 1), life: rnd(2, 4), wobble: 2 } } })
  pools.smoke.addEmitter({ rate: 16, make: () => { const isl = pick(islands.slice(0, -1)); return { x: wx(R(-40, 40)), y: J.riverY + 0.4, z: wz(isl.s1 + R(0, isl.gap)), vx: rnd(-0.5, 0.5), vy: rnd(0.2, 0.7), vz: rnd(0.3, 1), life: rnd(3, 5), c0: [0.88, 0.98, 0.94, 0.3], c1: [1, 1, 1, 0], s0: 3, s1: 9, drag: 0.4 } } })
  const birds = []
  {
    const birdMat = batchMaterial(false)
    for (let i = 0; i < 7; i++) {
      const b = new Batch()
      const col = pick(['#e8262e', '#1f7bff', '#ffd21f', '#2fbf4a'])
      b.box(0.4, 0.4, 0.9, col, 0, 0, 0)
      b.box(0.3, 0.3, 0.35, col, 0, 0.15, 0.55)
      b.box(0.14, 0.14, 0.3, '#ffb020', 0, 0.1, 0.85)
      b.box(0.3, 0.1, 0.6, col, 0, 0, -0.65)
      const body = b.build(birdMat, false)
      const wings = []
      const g = new Group()
      g.add(body)
      for (const side of SIDES) {
        const w = new Group()
        w.position.set(side * 0.2, 0.1, 0)
        const wb = new Batch()
        wb.box(1.1, 0.06, 0.55, col, side * 0.55, 0, 0)
        w.add(wb.build(birdMat, false))
        w.userData.side = side
        g.add(w)
        wings.push(w)
      }
      g.scale.setScalar(1.6)
      root.add(g)
      birds.push({ g, wings, r: R(20, 46), y: R(16, 34), s: R(40, L), speed: R(0.25, 0.45) * (rand() < 0.5 ? 1 : -1), a: R(0, TAU) })
    }
  }

  // --- Splash / spray helpers -------------------------------------------------------------------------
  function splash(x, z, big = 1) {
    for (let i = 0; i < 50 * big; i++) {
      const a = rnd(0, TAU)
      const sp = rnd(1, 6) * big
      pools.smoke.spawn({ x: x + Math.cos(a) * rnd(0, 1.5), y: J.riverY + 0.2, z: z + Math.sin(a) * rnd(0, 1.5), vx: Math.cos(a) * sp, vy: rnd(4, 11) * big, vz: Math.sin(a) * sp, gravity: -16, life: rnd(0.6, 1.2), c0: [0.9, 1, 1, 0.85], c1: [0.85, 0.95, 1, 0], s0: rnd(0.6, 1.4), s1: rnd(1.5, 3), drag: 0.6 })
    }
    for (let i = 0; i < 24 * big; i++) {
      const a = (i / (24 * big)) * TAU
      pools.smoke.spawn({ x: x + Math.cos(a) * 1.2, y: J.riverY + 0.15, z: z + Math.sin(a) * 1.2, vx: Math.cos(a) * 5, vy: 0.4, vz: Math.sin(a) * 5, life: 0.9, c0: [0.95, 1, 1, 0.7], c1: [1, 1, 1, 0], s0: 1, s1: 2.6, drag: 3 })
    }
  }

  // --- Fail animations (main.js pins the player and draws the rider at the returned pose) -------------
  // kind 'river' (fell in) | 'log' | 'sweeper' (knocked off: flung into the river first).
  function fail(kind, at, dir = 0) {
    if (kind === 'crush') return rollers.crushFail(at)
    const x0 = lx(at.x)
    const s0 = ls(at.z)
    let x = x0
    let s = s0
    let y = at.y
    let vx = 0
    let vy = 0
    let vs = 0
    let inWater = kind === 'river'
    let t = 0
    let chomped = false
    let croc = null
    let spin = 0
    if (!inWater) {
      // fling out over the side of the island into the water
      const side = dir || (x0 >= 0 ? 1 : -1)
      const dist = HW + 5 - side * x0
      vy = 11
      const tf = (vy + Math.sqrt(vy * vy + 2 * G * (y - J.riverY))) / G
      vx = (side * dist) / tf
      vs = rnd(-2, 2)
      audio.whack?.()
    } else {
      splash(at.x, at.z, 1.2)
      audio.splash?.()
    }
    function startCroc() {
      // the nearest croc dives in for the bite
      let best = null
      let bd = Infinity
      for (const c of crocs) {
        const d = Math.hypot(c.x - x, c.s - s)
        if (d < bd && c.state === 'swim') {
          bd = d
          best = c
        }
      }
      croc = best
      if (croc) {
        croc.state = 'lunge'
        croc.t = 0
        croc.target = { x, s }
        croc.from = { x: croc.x, s: croc.s }
      }
    }
    if (inWater) startCroc()
    return {
      kind,
      update(dt) {
        t += dt
        if (!inWater) {
          vy -= G * dt
          x += vx * dt
          s += vs * dt
          y += vy * dt
          spin += dt * 9
          if (y <= J.riverY) {
            y = J.riverY
            inWater = true
            splash(wx(x), wz(s), 1.3)
            audio.splash?.()
            startCroc()
            t = 0
          }
          return { x: wx(x), y, z: wz(s), roll: spin, pitch: spin * 0.4, squash: 1 }
        }
        // in the water: bob, then the croc snaps and drags you under
        if (croc && !chomped && croc.t > 0.55) {
          chomped = true
          audio.chomp?.()
          splash(wx(x), wz(s), 0.8)
        }
        const under = chomped ? Math.min(1, (t - 0.75) / 0.7) : 0
        const sink = J.riverY - 0.8 - Math.max(0, under) * 3 + Math.sin(t * 7) * 0.12
        return { x: wx(x), y: sink, z: wz(s), roll: Math.sin(t * 5) * 0.3, pitch: -0.4, squash: 1 }
      },
    }
  }

  // --- Queries for main.js -------------------------------------------------------------------------
  // --- Rolling temple boulders (lobby/rollers.js) ----------------------------------------------
  const B = J.boulders
  const rollers = createRollers({
    root, pools, audio, wx, wz, lx, ls,
    kinds: B.kinds, radius: B.radius, sink: B.sink, halfWidth: HW, spawnS: temple.s0 + B.spawnAt, baseSpeed: B.speed, every: B.every,
    gaps: islands.filter((i) => i.gap).map((i) => [i.s1, i.s1 + i.gap]),
    dust: [0.55, 0.5, 0.36],
  })
  // a sign on the first island: what the boulders are
  sign(root, wx(0), 9, wz(4), [
    { text: 'TEMPLE BOULDERS!', size: 1.6, color: '#ffd21f' },
    { text: 'Hide in the caves!', size: 1, color: '#ffffff' },
  ])

  const onCourse = (x, s) => s > -0.5 && s < L + 80 && Math.abs(x) < 70
  let launchedFrom = -1 // island index the bike launched from (until it lands)

  return {
    id: 'w2',
    root,
    length: L,
    start: { x: wx(0), y: 0.3, z: wz(-8), facing: Math.PI },
    ground: () => 'jungle',
    onCourse: (px, pz) => onCourse(lx(px), ls(pz)),
    altitude: (p) => Math.max(0, p.y),
    // Move rule (player.moveRule) on the course; null in the hub.
    rule(px, pz, max, wishX, wishZ, sprint) {
      const x = lx(px)
      const s = ls(pz)
      if (!onCourse(x, s)) return null
      let v = mpsFor(max) * (sprint ? LANE.sprint : 1)
      const isl = lastIslandAt(s)
      if (player.grounded && islandAt(s)) launchedFrom = -1
      if (isl.vcap && !player.grounded && s > isl.s1 - J.ramp.len) v = Math.min(v, isl.vcap)
      // the ramp lip: fly!
      if (isl.vcap && player.grounded && launchedFrom !== isl.k && Math.abs(x) < J.ramp.halfWidth + 0.5 && s > isl.s1 - 1.8 && s < isl.s1 + 0.6 && player.velocity.z < -2) {
        const h = Math.min(Math.hypot(player.velocity.x, player.velocity.z), isl.vcap)
        player.launch = Math.max(player.velocity.y, J.launch * h)
        launchedFrom = isl.k
        audio.rampLaunch?.(h)
        for (let i = 0; i < 26; i++) pools.glow.spawn({ ...sparkleParticle(px, J.ramp.height + 0.4, pz, pick(['#7dff4a', '#ffd21f', '#ffffff']), 1.4), vy: rnd(2, 6), vz: rnd(2, 6), gravity: -9, life: 1 })
      }
      return { speed: v }
    },
    // Speed training multiplier where the player rides (1 in the hub).
    trainAt(px, pz) {
      const s = ls(pz)
      if (s < 0 || !onCourse(lx(px), s)) return 1
      const isl = lastIslandAt(s)
      return isl === temple ? J.summitTrain : J.train[isl.k]
    },
    // The HUD's NEXT: the first gap this MAX can't clear yet.
    nextGoal(max) {
      for (const isl of islands) if (isl.need && isl.need > max) return { max: isl.need, name: isl.k + 1 === temple.k ? 'Temple' : `Island ${isl.k + 1}` }
      return null
    },
    // A hazard touching the player now: 'river' | 'log' | 'sweeper' (+ the fling direction), or null.
    hazard(p) {
      const x = lx(p.x)
      const s = ls(p.z)
      if (!onCourse(x, s)) return null
      if (p.y < J.failY) return { kind: 'river' }
      if (rollers.crushes(p.x, p.y, p.z)) return { kind: 'crush' }
      for (const l of logs) {
        if (Math.abs(s - l.lg.s) > 3.2) continue
        if (Math.abs(x - l.x) < J.logs.radius + 0.8 && p.y + 2 > l.y - J.logs.radius && p.y < l.y + J.logs.radius) return { kind: 'log', dir: Math.sign(l.x - l.prev) || 1 }
      }
      for (const w of sweepers) {
        const dx = x
        const ds = s - w.sw.s
        const r = Math.hypot(dx, ds)
        if (r > J.sweepers.radius + 0.6 || r < 0.5 || p.y > J.sweepers.height + 0.6) continue
        const a = w.sw.a
        const dist = Math.abs(dx * Math.sin(a) + ds * Math.cos(a)) // to the arm line (direction (cos a, -sin a) in x/s)
        if (dist < 1.15) return { kind: 'sweeper', dir: x >= 0 ? 1 : -1 }
      }
      return null
    },
    // A totem pad under the player: { wins, summit } or null.
    padAt(p) {
      const x = lx(p.x)
      const s = ls(p.z)
      for (const isl of islands) {
        const pd = isl.pad
        if (!pd) continue
        if (pd.summit ? Math.abs(x) < 7 && Math.abs(s - pd.s) < 3 : Math.abs(x - pd.x) < 2.7 && Math.abs(s - pd.s) < 2.4) return p.y < 1.2 ? pd : null
      }
      return null
    },
    fail,
    rollers,
    mode: () => rollers.mode(),
    update(dt, t, p, active, stopped = false) {
      for (const m of timers) m.uniforms.t.value = t
      if (!active) return []
      // the last stretch (the temple island, out in the open): the boulders come fast
      const ps = ls(p.z)
      const dashing = ps > temple.s0 && ps < temple.s0 + B.spawnAt && Math.abs(lx(p.x)) < HW
      const events = rollers.update(dt, t, p, stopped, dashing)
      // logs swing; spinners turn
      for (const l of logs) {
        l.prev = l.x
        l.angle = J.logs.swing * Math.sin((TAU * t) / l.lg.period + l.lg.phase)
        l.swing.rotation.z = l.angle
        l.x = Math.sin(l.angle) * J.logs.length
        l.y = J.logs.pivot - Math.cos(l.angle) * J.logs.length
        // a whoosh as it passes the bottom near the player
        const near = Math.hypot(lx(p.x) - l.x, ls(p.z) - l.lg.s)
        if (Math.abs(l.angle) < 0.12 && t - l.whoosh > 0.6 && near < 22) {
          l.whoosh = t
          audio.logSwoosh?.(near)
        }
      }
      for (const w of sweepers) {
        w.sw.a += w.sw.dir * w.sw.speed * dt
        w.spin.rotation.y = -w.sw.a
      }
      // crocs: lazy swims round their gap; a lunge at whoever fell in
      for (const c of crocs) {
        c.t += dt
        if (c.state === 'swim') {
          c.phase += dt * c.speed * 0.15
          const tx = c.home.x + Math.sin(c.phase) * 10
          const tsn = c.home.s + Math.cos(c.phase * 0.7) * Math.max(2, c.isl.gap * 0.3)
          const dx = tx - c.x
          const ds = tsn - c.s
          c.x += dx * Math.min(1, dt * 0.6)
          c.s += ds * Math.min(1, dt * 0.6)
          if (Math.hypot(dx, ds) > 0.05) c.yaw = Math.atan2(dx, -ds)
          c.m.position.set(wx(c.x), J.riverY - 0.3 + Math.sin(t * 1.3 + c.phase) * 0.06, wz(c.s))
          c.m.rotation.set(0, c.yaw, 0)
          c.m.userData.jaw.rotation.x = 0.05 + Math.max(0, Math.sin(t * 0.8 + c.phase * 3)) * 0.1
        } else if (c.state === 'lunge') {
          const k = Math.min(1, c.t / 0.5)
          c.x = c.from.x + (c.target.x - c.from.x) * k
          c.s = c.from.s + (c.target.s - c.from.s) * k
          if (k < 1) c.yaw = Math.atan2(c.target.x - c.from.x, -(c.target.s - c.from.s))
          const leap = Math.sin(Math.min(1, c.t / 0.9) * Math.PI) * 1.6
          c.m.position.set(wx(c.x - Math.sin(c.yaw) * 2), J.riverY - 0.3 + leap, wz(c.s + Math.cos(c.yaw) * 2))
          c.m.rotation.set(-leap * 0.25, c.yaw, 0)
          c.m.userData.jaw.rotation.x = c.t < 0.55 ? 0.9 : Math.max(0, 0.9 - (c.t - 0.55) * 8)
          if (c.t > 2.2) {
            c.state = 'swim'
            c.t = 0
          }
        }
      }
      for (const b of birds) {
        b.a += b.speed * dt
        const x = Math.cos(b.a) * b.r
        const s = b.s + Math.sin(b.a) * b.r * 0.6
        b.g.position.set(wx(x), b.y + Math.sin(t * 0.7 + b.r) * 2, wz(s))
        b.g.rotation.y = Math.atan2(-Math.sin(b.a) * Math.sign(b.speed), -Math.cos(b.a) * 0.6 * Math.sign(b.speed))
        const f = Math.sin(t * 12 + b.r) * 0.7
        for (const w of b.wings) w.rotation.z = w.userData.side * f
      }
      idol.rotation.y = Math.PI + Math.sin(t * 0.6) * 0.15
      for (const pad of padRings) pad.material.emissiveIntensity = 0.3 + Math.sin(t * 4) * 0.15
      return events
    },
  }
}
