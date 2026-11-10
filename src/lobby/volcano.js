// World 3: Magma Run. North of the volcano hub's gate, basalt outposts are linked by narrow tiled
// bridges over a lava lake, climbing toward an erupting volcano. Step onto a bridge and it cracks:
// after VOLCANO.crackDelay s it collapses from its start toward the far end at the pace of a bike
// at MAX need[k] (no sprint), so you have to outrun it. From bridge `meteors.from` on, meteors fall
// out of the volcano (a red ring marks each landing spot): a hit burns you and punches a hole in
// that lane of the bridge for a few seconds, so you steer round them. Outposts are safe and have
// pads (+N Wins, back to the hub); the last is the Crater Throne.
// Local frame: x = world x - origin.x, s = m along the course from the gate (world z = origin.z +
// HUB.gateZ - s). Outpost tops and bridge decks are at y = 0, the lava at VOLCANO.lavaY.
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three'
import { HUB, LANE, VOLCANO as V } from '../config.js'
import { mulberry32 } from '../textures.js'
import { label, neon } from '../propkit.js'
import { studMat } from './materials.js'
import { fireParticle, rnd, sparkleParticle } from './fx.js'
import { mpsFor } from './lane.js'
import { Batch, SIDES, TAU, batchMaterial, boxCollider, fallMaterial, lavaMaterial, rng, sign } from './worldkit.js'
import { createRollers } from './rollers.js'

const HW = V.halfWidth
const OH = V.outpostHalf
const rand = mulberry32(6620)
const { R, pick } = rng(rand)

// --- Layout --------------------------------------------------------------------------------------
export const outposts = []
export const bridges = []
{
  let s = 0
  for (let k = 0; k <= V.need.length; k++) {
    const len = k === 0 ? V.startLen : k === V.need.length ? 56 : V.outpostLen + Math.max(0, k - 6) * 3
    outposts.push({ k, s0: s, s1: s + len, side: k % 2 ? 1 : -1 })
    s += len
    if (k < V.need.length) {
      const blen = V.bridgeLen[k]
      const rows = Math.max(4, Math.round(blen / V.tile))
      bridges.push({ k, b0: s, b1: s + blen, rows, rowLen: blen / rows, need: V.need[k], pace: mpsFor(V.need[k]) })
      s += blen
    }
  }
}
const throne = outposts[outposts.length - 1]
export const courseLength = throne.s1
for (const o of outposts) {
  if (o.k === 0) continue
  o.pad = o === throne ? { x: 0, s: o.s0 + 16, wins: V.summitWins, summit: true } : { x: o.side * (OH + V.bay.depth / 2), s: o.s0 + V.bay.from + V.bay.len / 2, wins: V.padWins[o.k - 1] }
}
// Safe caves (boulder shelters, like the hill's): an obsidian cave in the side of every outpost but
// the throne, on the pad's side; the magma boulders only fill the open outpost (|x| < outpostHalf).
for (const o of outposts) if (o !== throne) o.bay = { side: o.side, s0: o.s0 + V.bay.from, s1: o.s0 + V.bay.from + V.bay.len }
const outpostAt = (s) => {
  let out = outposts[0]
  for (const o of outposts) if (s >= o.s0 - 0.5) out = o
  return out
}
const bridgeAt = (s) => bridges.find((b) => s >= b.b0 && s <= b.b1)

// =============================================================================================
export function buildVolcano(scene, pools, audio = {}, origin = { x: 0, z: 0 }) {
  const root = new Group()
  root.name = 'volcano'
  scene.add(root)
  const OX = origin.x
  const OZ = origin.z + HUB.gateZ
  const wx = (x) => OX + x
  const wz = (s) => OZ - s
  const lx = (x) => x - OX
  const ls = (z) => OZ - z
  const L = courseLength
  const timers = []
  const events = []
  let player = { x: wx(0), y: 0, z: wz(-10) } // last known (for the ember emitter)

  // --- Lava lake + canyon -----------------------------------------------------------------------
  const lava = lavaMaterial({ flow: [0.1, -0.5] })
  timers.push(lava)
  const lake = new Mesh(new PlaneGeometry(240, L + 320), lava)
  lake.rotation.x = -Math.PI / 2
  lake.position.set(wx(0), V.lavaY, wz(L / 2 + 100))
  root.add(lake)

  const CELL = 6
  const cols = []
  for (let s = -10; s < L + 170; s += CELL) {
    for (const side of SIDES) {
      for (let k = 0; k < 4; k++) {
        cols.push({ x: side * (58 + k * CELL + (rand() < 0.3 ? R(-1.5, 1.5) : 0)), s, h: R(6, 14) + k * R(6, 11), k })
      }
    }
  }
  {
    const box = new BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const m = new Matrix4()
    const q = new Quaternion()
    const tint = new Color()
    const rock = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.9 }), cols.length)
    const caps = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.8 }), cols.length)
    cols.forEach((c, i) => {
      const base = V.lavaY - 3
      rock.setMatrixAt(i, m.compose(new Vector3(wx(c.x), base, wz(c.s)), q, new Vector3(CELL + 0.05, c.h - base, CELL + 0.05)))
      rock.setColorAt(i, tint.set(c.k < 1 ? '#3a3036' : '#2e262c').offsetHSL(0, R(-0.03, 0.03), R(-0.04, 0.04)))
      caps.setMatrixAt(i, m.compose(new Vector3(wx(c.x), c.h, wz(c.s)), q, new Vector3(CELL + 0.3, 0.7, CELL + 0.3)))
      caps.setColorAt(i, tint.set(rand() < 0.25 ? '#a8401a' : '#4a3a3a').offsetHSL(0, 0, R(-0.03, 0.03)))
    })
    rock.castShadow = rock.receiveShadow = caps.receiveShadow = true
    root.add(rock, caps)
    // Obsidian spikes on the rim.
    const spikes = new Batch()
    for (const c of cols) {
      if (c.k < 1 || rand() > 0.35) continue
      const h = R(3, 9)
      spikes.cone(R(0.8, 1.6), h, pick(['#1d1626', '#2a1f3a', '#140f1a']), wx(c.x + R(-2, 2)), c.h + h / 2 + 0.3, wz(c.s + R(-2, 2)), R(-0.15, 0.15), 0, R(-0.15, 0.15), 5)
    }
    root.add(spikes.build(batchMaterial(false)))
  }
  // Lava falls down the canyon walls.
  function lavafall(x, s, top, width, face) {
    const mat = fallMaterial([2.2, 0.5, 0.05], [3.4, 1.6, 0.25], 0.8)
    timers.push(mat)
    const h = top - V.lavaY
    const sheet = new Mesh(new PlaneGeometry(width, h), mat)
    sheet.position.set(wx(x), V.lavaY + h / 2, wz(s))
    sheet.rotation.y = face
    root.add(sheet)
    pools.smoke.addEmitter({ rate: 6, make: () => ({ x: wx(x + rnd(-1, 1) * Math.sign(-x) * 2), y: V.lavaY + 0.5, z: wz(s + rnd(-width / 2, width / 2)), vx: rnd(-1, 1), vy: rnd(2, 4), vz: rnd(-1, 1), life: rnd(2, 3.4), c0: [0.3, 0.26, 0.28, 0.5], c1: [0.5, 0.45, 0.45, 0], s0: 2, s1: 8, drag: 0.6 }) })
    pools.fire.addEmitter({ rate: 10, make: () => fireParticle(wx(x - Math.sign(x) * 1.5), V.lavaY + 0.4, wz(s + rnd(-width / 2, width / 2)), 1.4) })
  }
  lavafall(-55, L * 0.25, 20, 9, Math.PI / 2)
  lavafall(55, L * 0.5, 26, 11, -Math.PI / 2)
  lavafall(-55, L * 0.75, 30, 8, Math.PI / 2)
  lavafall(55, L * 0.92, 34, 10, -Math.PI / 2)

  // --- The volcano at the far end: cone, glowing crater, smoke plume, eruptions ---------------------
  const VS = L + 150
  const crater = { x: 0, y: 118, s: VS }
  {
    const b = new Batch()
    for (let i = 0; i < 9; i++) {
      const r0 = 150 - i * 14
      const h = 14
      b.cyl(r0, h, i % 2 ? '#2a2026' : '#342a30', wx(0), V.lavaY + i * h + h / 2, wz(VS), 0, i * 0.3, 0, 14, r0 - 14)
    }
    b.cyl(24, 6, '#1d1418', wx(0), V.lavaY + 9 * 14 + 3, wz(VS), 0, 0, 0, 14, 20)
    root.add(b.build(batchMaterial(true), false))
    const glowDisc = new Mesh(new CylinderGeometry(19, 19, 0.5, 24), neon('#ff6a1a', 4))
    glowDisc.position.set(wx(0), V.lavaY + 9 * 14 + 5.5, wz(VS))
    root.add(glowDisc)
    // lava rivers down the front face
    for (const [x, w] of [[-18, 7], [6, 9], [28, 6]]) {
      const mat = fallMaterial([2.4, 0.5, 0.05], [3.4, 1.5, 0.2], 0.4)
      timers.push(mat)
      const len = 150
      const sheet = new Mesh(new PlaneGeometry(w, len), mat)
      sheet.position.set(wx(x), 60, wz(VS - 75))
      sheet.rotation.set(-0.8, 0, 0)
      sheet.material.side = DoubleSide
      root.add(sheet)
    }
    pools.smoke.addEmitter({ rate: 14, make: () => ({ x: wx(rnd(-12, 12)), y: crater.y + 4, z: wz(VS + rnd(-12, 12)), vx: rnd(-2, 2) + 3, vy: rnd(8, 14), vz: rnd(-2, 2), life: rnd(5, 8), c0: [0.25, 0.2, 0.22, 0.8], c1: [0.45, 0.4, 0.42, 0], s0: 14, s1: 46, drag: 0.25 }) })
    pools.fire.addEmitter({ rate: 30, make: () => ({ ...fireParticle(wx(rnd(-14, 14)), crater.y + 5, wz(VS + rnd(-14, 14)), 4), vy: rnd(6, 16) }) })
  }
  let eruptTimer = 6

  // --- Outposts ----------------------------------------------------------------------------------------
  const outBatch = new Batch()
  const glowBatch = new Batch()
  const braziers = []
  const geysers = []
  for (const o of outposts) {
    const len = o.s1 - o.s0
    const sc = (o.s0 + o.s1) / 2
    const body = new Mesh(new BoxGeometry(OH * 2, 18, len), studMat('#3a3036', { roughness: 0.9, tile: 1.4 }))
    body.position.set(wx(0), -9.4, wz(sc))
    body.castShadow = body.receiveShadow = true
    const top = new Mesh(new BoxGeometry(OH * 2 + 0.4, 0.8, len + 0.4), studMat(o === throne ? '#2a1f3a' : '#4a3f44', { roughness: 0.85 }))
    top.position.set(wx(0), -0.4, wz(sc))
    top.receiveShadow = true
    root.add(body, top)
    boxCollider(OH, 9, len / 2, wx(0), -9, wz(sc))
    // hex basalt columns round the edges + a low wall (collider) so you don't ride into the lava
    for (const side of SIDES) {
      const bay = o.bay && o.bay.side === side ? o.bay : null
      for (let ss = o.s0 + 1.2; ss < o.s1 - 1; ss += 2.2) {
        if (bay && ss > bay.s0 - 1 && ss < bay.s1 + 1) continue
        const h = R(0.8, 2.2)
        outBatch.cyl(1.1, h, pick(['#2e262c', '#3a3036', '#241e24']), wx(side * (OH - 0.9)), h / 2, wz(ss), 0, R(0, 1), 0, 6)
      }
      const spans = bay ? [[o.s0 + 0.5, bay.s0], [bay.s1, o.s1 - 0.5]] : [[o.s0 + 0.5, o.s1 - 0.5]]
      for (const [a, c] of spans) if (c - a > 0.2) boxCollider(1, 0.8, (c - a) / 2, wx(side * (OH - 0.9)), 0.8, wz((a + c) / 2))
      if (bay) {
        // the cave: a basalt ledge over the lava, obsidian walls + roof, glowing cracks, dripping lava
        const D = V.bay.depth
        const bs = (bay.s0 + bay.s1) / 2
        const bl = bay.s1 - bay.s0
        const ledge = new Mesh(new BoxGeometry(D, 16, bl), studMat('#3a3036', { roughness: 0.9, tile: 1.4 }))
        ledge.position.set(wx(side * (OH + D / 2)), -8.4, wz(bs))
        ledge.castShadow = ledge.receiveShadow = true
        root.add(ledge)
        outBatch.box(D + 0.3, 0.8, bl + 0.3, '#4a3f44', wx(side * (OH + D / 2)), -0.4, wz(bs))
        boxCollider(D / 2, 8, bl / 2, wx(side * (OH + D / 2)), -8, wz(bs))
        outBatch.box(1.6, 9, bl + 2.4, '#1d1626', wx(side * (OH + D + 0.4)), 3.5, wz(bs))
        boxCollider(0.8, 5, bl / 2 + 1, wx(side * (OH + D + 0.4)), 4, wz(bs))
        for (const end of [bay.s0 - 0.4, bay.s1 + 0.4]) {
          outBatch.box(D + 1, 9.5, 1.6, '#241a2e', wx(side * (OH + D / 2)), 3.7, wz(end))
          boxCollider(D / 2 + 0.5, 5, 0.8, wx(side * (OH + D / 2)), 4, wz(end))
        }
        outBatch.box(D + 2.4, 3, bl + 3.4, '#2a1f3a', wx(side * (OH + D / 2 + 0.3)), 9.5, wz(bs))
        outBatch.box(D, 0.4, bl, '#140f1a', wx(side * (OH + D / 2)), 7.9, wz(bs))
        for (let i = 0; i < 18; i++) {
          const h = R(0.8, 2.6)
          outBatch.cone(R(0.4, 0.9), h, pick(['#1d1626', '#2a1f3a']), wx(side * (OH + R(0.5, D - 0.5))), 7.9 - h / 2, wz(R(bay.s0 + 0.5, bay.s1 - 0.5)), Math.PI, 0, 0, 5)
        }
        for (let i = 0; i < 6; i++) glowBatch.box(0.12, R(1.5, 4), 0.12, '#ff6a1a', wx(side * (OH + D - 0.35)), R(1.5, 5), wz(R(bay.s0 + 1, bay.s1 - 1)), 0, 0, R(-0.4, 0.4))
        for (let i = 0; i < 4; i++) glowBatch.box(R(1.5, 3), 0.06, 0.2, '#ff6a1a', wx(side * (OH + R(2, D - 1.5))), 0.04, wz(R(bay.s0 + 1, bay.s1 - 1)), 0, R(0, Math.PI), 0)
        const dx = wx(side * (OH + 1))
        pools.fire.addEmitter({ rate: 3, make: () => ({ ...fireParticle(dx + rnd(-0.5, 0.5), 7.6, wz(rnd(bay.s0 + 1, bay.s1 - 1)), 0.4), vy: -rnd(3, 6), gravity: -8, life: 0.8 }) })
      }
      // front / back lips beside the bridge mouths
      for (const end of [o.s0 + 0.9, o.s1 - 0.9]) {
        if ((end === o.s0 + 0.9 && o.k === 0) || (end === o.s1 - 0.9 && o === throne)) continue
        const a = HW + 0.6
        for (let x = a + 1; x < OH - 1.5; x += 2.2) {
          const h = R(0.8, 1.8)
          outBatch.cyl(1.05, h, pick(['#2e262c', '#3a3036']), wx(side * x), h / 2, wz(end), 0, R(0, 1), 0, 6)
        }
        boxCollider((OH - a) / 2, 0.8, 0.9, wx(side * (a + (OH - a) / 2)), 0.8, wz(end))
      }
      // glowing cracks across the top
      for (let i = 0; i < len / 6; i++) {
        const s = R(o.s0 + 2, o.s1 - 2)
        const x = side * R(4, OH - 3)
        glowBatch.box(R(1.5, 4), 0.06, 0.22, '#ff6a1a', wx(x), 0.04, wz(s), 0, R(0, Math.PI), 0)
      }
    }
    if (o.k > 0) {
      // braziers on the bridge-end corners
      for (const side of SIDES) {
        const x = side * (HW + 2.2)
        const s = o.s0 + 2
        outBatch.cyl(0.45, 2.2, '#241e24', wx(x), 1.1, wz(s), 0, 0, 0, 6)
        outBatch.cyl(0.9, 0.5, '#5a2a20', wx(x), 2.45, wz(s), 0, 0, 0, 8, 1.2)
        braziers.push([wx(x), 2.8, wz(s)])
      }
      // a lava geyser vent in the corner
      const gx = -o.side * (OH - 5)
      const gs = o.s0 + len * 0.6
      outBatch.cyl(1.6, 0.6, '#241e24', wx(gx), 0.3, wz(gs), 0, 0, 0, 8, 1.1)
      glowBatch.cyl(1.0, 0.1, '#ff8a1f', wx(gx), 0.62, wz(gs), 0, 0, 0, 8)
      boxCollider(1.6, 0.4, 1.6, wx(gx), 0.4, wz(gs))
      geysers.push({ x: wx(gx), z: wz(gs), t: R(0, 6), every: R(5, 8) })
    }
  }
  root.add(outBatch.build(batchMaterial(true)))
  const glowMesh = glowBatch.build(neon('#ff6a1a', 3.2), false)
  glowMesh.material.vertexColors = false
  root.add(glowMesh)
  pools.fire.addEmitter({ rate: braziers.length * 5, make: () => { const [x, y, z] = pick(braziers); return fireParticle(x, y, z, 0.8) } })

  // --- Pads + the Crater Throne ----------------------------------------------------------------------
  const pads = []
  for (const o of outposts) {
    const p = o.pad
    if (!p || p.summit) continue
    const color = o.k % 2 ? '#ff7a1f' : '#ffd21f'
    const pad = new Mesh(new BoxGeometry(5, 0.28, 4.4), studMat(color, { emissive: color, emissiveIntensity: 0.4, tile: 1 }))
    pad.position.set(wx(p.x), 0.14, wz(p.s))
    root.add(pad)
    pads.push(pad)
    // obsidian obelisk with a glowing rune behind the pad
    const ob = new Batch()
    const tx = wx(o.side * (OH + V.bay.depth - 2))
    const tz = wz(o.bay.s1 - 2)
    ob.box(1.6, 6, 1.6, '#1d1626', tx, 3, tz)
    ob.cone(1.15, 1.6, '#2a1f3a', tx, 6.8, tz, 0, Math.PI / 4, 0, 4)
    root.add(ob.build(batchMaterial(true)))
    const rune = new Mesh(new BoxGeometry(0.9, 0.9, 0.08), neon('#ff6a1a', 4))
    rune.position.set(tx, 4, tz + 0.82 * (o.side > 0 ? 1 : 1))
    rune.rotation.y = 0
    root.add(rune)
    boxCollider(0.85, 3.4, 0.85, tx, 3.4, tz)
    const tag = new Group()
    const l1 = label(`+${p.wins.toLocaleString('en-US')} WINS`, 1.1, { color: '#ffd21f', outline: '#3a1a00', outlineWidth: 14 })
    const l2 = label('Return', 0.7, { color: '#ffffff', outline: '#14112b', outlineWidth: 10 })
    l2.position.y = -0.9
    const l0 = label(`CAVE ${o.k} · x${V.train[o.k]} SPEED`, 0.75, { color: '#ffb08a', outline: '#2a0a05', outlineWidth: 10 })
    l0.position.y = 1.05
    tag.add(l0, l1, l2)
    tag.position.set(wx(p.x), 4, wz(p.s))
    root.add(tag)
  }
  const core = new Group()
  {
    const sp = throne.pad
    const pad = new Mesh(new BoxGeometry(14, 0.3, 6), studMat('#ff7a1f', { emissive: '#ff5a1a', emissiveIntensity: 0.55, tile: 1 }))
    pad.position.set(wx(0), 0.15, wz(sp.s))
    root.add(pad)
    pads.push(pad)
    // obsidian throne on a stepped dais, two lava pillars, the floating magma core above
    const b = new Batch()
    const ts = throne.s1 - 16
    for (let i = 0; i < 4; i++) b.box(22 - i * 4, 1.2, 14 - i * 2.4, i % 2 ? '#241a2e' : '#2a1f3a', wx(0), 0.6 + i * 1.2, wz(ts))
    b.box(6, 7, 4, '#1d1626', wx(0), 8.3, wz(ts + 2))
    b.box(7, 1, 4.6, '#ff7a1f', wx(0), 5.3, wz(ts + 1.4))
    for (const side of SIDES) {
      b.box(1.4, 4, 4.4, '#1d1626', wx(side * 3.8), 6.8, wz(ts + 1.4))
      b.cone(0.8, 3, '#2a1f3a', wx(side * 2.6), 13.3, wz(ts + 2), 0, 0, side * -0.3, 5)
      b.cyl(1.4, 14, '#241e24', wx(side * 12), 7, wz(ts - 4), 0, 0, 0, 6)
    }
    root.add(b.build(batchMaterial(true)))
    boxCollider(11, 4, 7, wx(0), 4, wz(ts))
    for (const side of SIDES) {
      boxCollider(1.4, 7, 1.4, wx(side * 12), 7, wz(ts - 4))
      const fx = wx(side * 12)
      const fz = wz(ts - 4)
      pools.fire.addEmitter({ rate: 40, make: () => fireParticle(fx + rnd(-0.8, 0.8), 14.2, fz + rnd(-0.8, 0.8), 1.4) })
    }
    const orb = new Mesh(new IcosahedronGeometry(2.6, 1), neon('#ff8a1f', 4.5))
    const shell = new Mesh(new IcosahedronGeometry(3.3, 0), new MeshStandardMaterial({ color: '#1d1626', roughness: 0.3, metalness: 0.4, flatShading: true, transparent: true, opacity: 0.55 }))
    core.add(orb, shell)
    core.position.set(wx(0), 19, wz(ts + 1))
    root.add(core)
    const light = new PointLight('#ff7a2a', 60, 45, 1.5)
    light.position.set(wx(0), 14, wz(ts - 6))
    root.add(light)
    pools.glow.addEmitter({ rate: 18, make: () => sparkleParticle(wx(0), 17, wz(ts + 1), '#ffb020', 3.4) })
    sign(root, wx(0), 9, wz(sp.s), [
      { text: `🏆 CRATER THRONE +${V.summitWins.toLocaleString('en-US')} WINS`, size: 1.9, color: '#ffd21f', outline: '#3a0a00' },
      { text: `x${V.summitTrain} SPEED`, size: 1.1, color: '#ffb08a', outline: '#2a0a05' },
    ])
  }

  // --- Bridges: tiles (instanced) with their own colliders, support pillars ---------------------------
  const tileGeo = new BoxGeometry(1, 1, 1)
  const zero = new Matrix4().makeScale(0, 0, 0)
  const tmpM = new Matrix4()
  const tmpQ = new Quaternion()
  const tmpE = new Object3D()
  const BASE = new Color('#3a3238')
  const HOT = new Color('#ff5a1a')
  const tc = new Color()
  const pillarBatch = new Batch()
  for (const b of bridges) {
    const n = b.rows * 2
    b.tiles = []
    b.inst = new InstancedMesh(tileGeo, studMat('#ffffff', { roughness: 0.75 }), n)
    b.curbs = new InstancedMesh(tileGeo, studMat('#ffffff', { roughness: 0.8 }), n)
    b.inst.castShadow = b.inst.receiveShadow = b.curbs.castShadow = true
    for (let r = 0; r < b.rows; r++) {
      const s = b.b0 + (r + 0.5) * b.rowLen
      for (const lane of SIDES) {
        const x = lane * HW * 0.5
        const floor = boxCollider(HW * 0.5 - 0.02, 0.5, b.rowLen / 2 - 0.02, wx(x), -0.5, wz(s))
        const curb = boxCollider(0.35, 0.55, b.rowLen / 2, wx(lane * (HW - 0.35)), 0.55, wz(s))
        const shade = BASE.clone().offsetHSL(0, R(-0.02, 0.02), R(-0.05, 0.05))
        b.tiles.push({ r, lane, s, x, state: 'up', y: 0, vy: 0, rot: 0, spin: R(-3, 3), t: 0, floor, curb, base: shade, hole: 0, i: b.tiles.length })
      }
      if (r % 4 === 1) {
        for (const lane of SIDES) {
          pillarBatch.cyl(0.9, -V.lavaY + 0.2, '#241e24', wx(lane * (HW - 1.4)), V.lavaY / 2 - 0.5, wz(s), 0, 0, 0, 6)
          pillarBatch.cyl(1.4, 0.8, '#5a2a20', wx(lane * (HW - 1.4)), V.lavaY + 0.3, wz(s), 0, 0, 0, 6)
        }
      }
    }
    b.phase = 'idle'
    b.t = 0
    b.front = b.b0
    b.dirty = true
    b.holes = 0
    root.add(b.inst, b.curbs)
    drawBridge(b, 0)
    // sign at the mouth
    sign(root, wx(0), 6.5, wz(b.b0 - 1.5), [
      { text: `OUTRUN IT! MAX ${b.need}`, size: 1.45, color: '#ffb020' },
      { text: `${Math.round(b.b1 - b.b0)} m bridge`, size: 0.85, color: '#ffffff' },
    ])
  }
  root.add(pillarBatch.build(batchMaterial(true)))

  function setTileEnabled(tile, on) {
    tile.floor.setEnabled(on)
    tile.curb.setEnabled(on)
  }
  function drawBridge(b, t) {
    for (const tile of b.tiles) {
      if (tile.state === 'down') {
        b.inst.setMatrixAt(tile.i, zero)
        b.curbs.setMatrixAt(tile.i, zero)
        continue
      }
      let y = tile.y
      let shake = 0
      if (tile.state === 'shake') {
        shake = 1
        y += Math.sin(t * 60 + tile.i) * 0.06
      }
      tmpE.position.set(wx(tile.x), y - 0.5, wz(tile.s))
      tmpE.rotation.set(tile.rot, 0, tile.rot * 0.5 * tile.lane)
      tmpE.scale.set(HW - 0.08, 1, b.rowLen - 0.1)
      tmpE.updateMatrix()
      b.inst.setMatrixAt(tile.i, tmpE.matrix)
      tmpE.position.set(wx(tile.lane * (HW - 0.35)), y + 0.5, wz(tile.s))
      tmpE.scale.set(0.7, 1.1, b.rowLen - 0.12)
      tmpE.updateMatrix()
      b.curbs.setMatrixAt(tile.i, tmpE.matrix)
      const heat = tile.state === 'rise' ? 1 - tile.t : shake ? 0.5 + Math.sin(t * 20 + tile.i) * 0.3 : tile.state === 'fall' ? 1 : 0
      b.inst.setColorAt(tile.i, tc.copy(tile.base).lerp(HOT, Math.max(0, heat)))
      b.curbs.setColorAt(tile.i, tc.set('#2a2228').lerp(HOT, Math.max(0, heat) * 0.6))
    }
    b.inst.instanceMatrix.needsUpdate = b.curbs.instanceMatrix.needsUpdate = true
    if (b.inst.instanceColor) b.inst.instanceColor.needsUpdate = true
    if (b.curbs.instanceColor) b.curbs.instanceColor.needsUpdate = true
  }
  function drop(tile) {
    if (tile.state === 'fall' || tile.state === 'down') return
    tile.state = 'fall'
    tile.vy = rnd(-1, 1)
    tile.t = 0
    setTileEnabled(tile, false)
  }
  function updateBridge(b, dt, t, p) {
    b.t += dt
    if (b.phase === 'crack' && b.t >= V.crackDelay) {
      b.phase = 'collapse'
      b.t = 0
      b.front = b.b0
      audio.bridgeCollapse?.()
    }
    if (b.phase === 'collapse') {
      b.front += b.pace * dt
      for (const tile of b.tiles) {
        if (tile.s - b.rowLen / 2 < b.front) drop(tile)
        else if (tile.state === 'up' && tile.s - b.front < 10) tile.state = 'shake'
      }
      // the front throws embers and smoke as the tiles go
      for (let i = 0; i < 3; i++) pools.fire.spawn({ ...fireParticle(wx(rnd(-HW, HW)), rnd(-1, 0.5), wz(b.front), 1.4), vy: rnd(3, 8) })
      pools.smoke.spawn({ x: wx(rnd(-HW, HW)), y: rnd(-1, 1), z: wz(b.front), vx: rnd(-1, 1), vy: rnd(2, 5), vz: rnd(-1, 1), life: rnd(1, 2), c0: [0.3, 0.25, 0.27, 0.7], c1: [0.5, 0.45, 0.45, 0], s0: 2, s1: 6, drag: 1 })
      const d = Math.hypot(lx(p.x), ls(p.z) - b.front)
      if (d < 30) events.push({ type: 'shake', k: 0.05 * (1 - d / 30) })
      if (b.front >= b.b1) {
        b.phase = 'wait'
        b.t = 0
      }
    } else if (b.phase === 'crack') {
      for (const tile of b.tiles) if (tile.state === 'up' && tile.s - b.b0 < 14) tile.state = 'shake'
    } else if (b.phase === 'wait' && b.t >= V.rebuild) {
      b.phase = 'rise'
      b.t = 0
      for (const tile of b.tiles) {
        if (tile.state === 'shake') tile.state = 'up'
        if (tile.state === 'down' || tile.state === 'fall') {
          tile.state = 'rise'
          tile.t = -tile.r * 0.04
          tile.y = V.lavaY - 2
          tile.rot = 0
        }
      }
    }
    let busy = b.phase !== 'idle'
    for (const tile of b.tiles) {
      if (tile.state === 'fall') {
        busy = true
        tile.t += dt
        tile.vy -= 28 * dt
        tile.y += tile.vy * dt
        tile.rot += tile.spin * dt * 0.4
        if (tile.y < V.lavaY + 0.5 && !tile.splashed) {
          tile.splashed = true
          for (let i = 0; i < 6; i++) pools.fire.spawn({ ...fireParticle(wx(tile.x + rnd(-2, 2)), V.lavaY + 0.3, wz(tile.s + rnd(-1.5, 1.5)), 1.6), vy: rnd(4, 9) })
        }
        if (tile.y < V.lavaY - 2.5) {
          tile.state = 'down'
          tile.splashed = false
        }
      } else if (tile.state === 'down') {
        if (tile.hole && b.phase === 'idle' && t > tile.hole) {
          tile.hole = 0
          tile.state = 'rise'
          tile.t = 0
          tile.y = V.lavaY - 2
          tile.rot = 0
        } else if (tile.hole) busy = true
      } else if (tile.state === 'rise') {
        busy = true
        tile.t += dt * 1.1
        const k = Math.max(0, Math.min(1, tile.t))
        tile.y = (V.lavaY - 2) * (1 - k) * (1 - k)
        if (k >= 1) {
          tile.state = 'up'
          tile.y = 0
          tile.t = 0
          setTileEnabled(tile, true)
        }
      }
    }
    if (b.phase === 'rise' && b.tiles.every((x) => x.state === 'up' || (x.state === 'down' && x.hole))) b.phase = 'idle'
    drawBridge(b, t)
    return busy
  }

  // --- Meteors -----------------------------------------------------------------------------------
  const meteorRock = new IcosahedronGeometry(1.6, 0)
  const meteorMat = new MeshStandardMaterial({ color: '#2a1f22', roughness: 0.8, flatShading: true, emissive: '#ff4a12', emissiveIntensity: 0.6 })
  const ringGeo = new RingGeometry(0.75, 1, 40)
  const meteors = []
  let meteorTimer = 2
  let meteorHit = false
  function spawnMeteor(tx, ts) {
    let m = meteors.find((x) => !x.alive)
    if (!m) {
      const mesh = new Mesh(meteorRock, meteorMat)
      mesh.castShadow = true
      const ring = new Mesh(ringGeo, neon('#ff2a1a', 3.5, { transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false }))
      ring.rotation.x = -Math.PI / 2
      const dot = new Mesh(new RingGeometry(0, 0.35, 24), neon('#ff6a1a', 3, { transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false }))
      dot.rotation.x = -Math.PI / 2
      root.add(mesh, ring, dot)
      m = { mesh, ring, dot }
      meteors.push(m)
    }
    m.alive = true
    m.t = 0
    m.to = new Vector3(wx(tx), 0.06, wz(ts))
    m.from = new Vector3(wx(tx + rnd(-25, 25)), 95, wz(ts + 70))
    m.mesh.visible = m.ring.visible = m.dot.visible = true
    m.ring.position.copy(m.to)
    m.dot.position.copy(m.to)
    audio.meteorFall?.()
  }
  function impact(m, p) {
    m.alive = false
    m.mesh.visible = m.ring.visible = m.dot.visible = false
    const at = m.to
    for (let i = 0; i < 40; i++) pools.fire.spawn({ ...fireParticle(at.x + rnd(-1, 1), at.y + 0.3, at.z + rnd(-1, 1), 2.2), vx: rnd(-9, 9), vy: rnd(4, 14), vz: rnd(-9, 9), gravity: -14, life: rnd(0.6, 1.2) })
    for (let i = 0; i < 26; i++) pools.smoke.spawn({ x: at.x + rnd(-2, 2), y: at.y + 0.5, z: at.z + rnd(-2, 2), vx: rnd(-4, 4), vy: rnd(2, 6), vz: rnd(-4, 4), life: rnd(1.2, 2.2), c0: [0.25, 0.2, 0.2, 0.85], c1: [0.5, 0.45, 0.45, 0], s0: 2, s1: 7, drag: 1.4 })
    const d = Math.hypot(at.x - p.x, at.z - p.z)
    audio.meteorImpact?.(d)
    events.push({ type: 'shake', k: Math.max(0, 1 - d / 60) * 0.9 })
    if (d < V.meteors.radius && p.y < 3) meteorHit = true
    // punch a hole in the bridge lane it hit
    const s = ls(at.z)
    const b = bridgeAt(s)
    if (b) {
      const x = lx(at.x)
      for (const tile of b.tiles) {
        if (Math.abs(tile.s - s) < b.rowLen * 0.75 && Math.sign(x || 1) === tile.lane && tile.state !== 'down' && tile.state !== 'fall') {
          drop(tile)
          tile.hole = performance.now() / 1000 // set properly in update (needs the game clock)
          tile.holePending = true
        }
      }
      b.dirty = true
    }
  }

  // Embers rising round the player and ash drifting down (follow the player).
  pools.fire.addEmitter({ rate: 14, make: () => ({ ...fireParticle(player.x + rnd(-30, 30), V.lavaY + 0.5, player.z + rnd(-40, 20), 0.35), vy: rnd(2, 5), life: rnd(1.5, 3), wobble: 1.2 }) })
  pools.smoke.addEmitter({ rate: 8, make: () => ({ x: player.x + rnd(-25, 25), y: player.y + rnd(10, 18), z: player.z + rnd(-30, 15), vx: rnd(-0.5, 0.5), vy: -rnd(0.6, 1.4), vz: rnd(-0.3, 0.3), life: rnd(4, 7), c0: [0.35, 0.32, 0.33, 0.6], c1: [0.4, 0.38, 0.38, 0], s0: 0.25, s1: 0.18, wobble: 0.6 }) })

  // --- Fail animations ------------------------------------------------------------------------------
  // kind 'lava' (fell in: sinks, burning) | 'meteor' (hit: blasted up, then into the lava or flat).
  function fail(kind, at) {
    if (kind === 'crush') return rollers.crushFail(at)
    let x = at.x
    let y = at.y
    let z = at.z
    let t = 0
    let vy = kind === 'meteor' ? 12 : 0
    const vx = kind === 'meteor' ? rnd(-5, 5) : 0
    let landed = kind === 'lava'
    audio.burn?.()
    return {
      kind,
      update(dt) {
        t += dt
        if (!landed) {
          vy -= 22 * dt
          x += vx * dt
          y += vy * dt
          const floorY = Math.abs(lx(x)) < OH && !bridgeAt(ls(z)) ? 0 : V.lavaY
          if (y <= floorY && vy < 0) {
            y = floorY
            landed = true
            t = 0
            audio.burn?.()
          }
          if (Math.random() < 0.8) pools.smoke.spawn({ x, y: y + 1, z, vx: rnd(-1, 1), vy: rnd(1, 3), vz: rnd(-1, 1), life: 1.2, c0: [0.15, 0.12, 0.12, 0.8], c1: [0.3, 0.28, 0.28, 0], s0: 1, s1: 3, drag: 1 })
          return { x, y, z, roll: t * 8, pitch: t * 3, squash: 1 }
        }
        const inLava = y < -1
        if (inLava) {
          y = Math.max(V.lavaY - 2.2, y - dt * 1.4)
          if (Math.random() < 0.9) pools.fire.spawn({ ...fireParticle(x + rnd(-0.8, 0.8), V.lavaY + 0.4, z + rnd(-0.8, 0.8), 1.3), vy: rnd(3, 7) })
        }
        if (Math.random() < 0.6) pools.smoke.spawn({ x: x + rnd(-0.5, 0.5), y: Math.max(y, V.lavaY) + 1.2, z: z + rnd(-0.5, 0.5), vx: rnd(-0.6, 0.6), vy: rnd(1.5, 3), vz: rnd(-0.6, 0.6), life: rnd(1, 1.8), c0: [0.12, 0.1, 0.1, 0.85], c1: [0.3, 0.28, 0.28, 0], s0: 1, s1: 3.6, drag: 0.8 })
        return { x, y: inLava ? y : y, z, roll: inLava ? Math.sin(t * 4) * 0.2 : 0, pitch: inLava ? -0.3 : 0, squash: inLava ? 1 : 0.35 }
      },
    }
  }

  // --- Queries -----------------------------------------------------------------------------------------
  // --- Magma boulders (lobby/rollers.js): down from the crater over everything, to the gate ----------
  const B = V.boulders
  const rollers = createRollers({
    root, pools, audio, wx, wz, lx, ls,
    kinds: B.kinds, radius: B.radius, sink: B.sink, halfWidth: OH, spawnS: throne.s0 + B.spawnAt, baseSpeed: B.speed, every: B.every,
    dust: [0.32, 0.27, 0.27],
  })
  sign(root, wx(0), 9, wz(4), [
    { text: 'MAGMA BOULDERS!', size: 1.6, color: '#ffb020' },
    { text: 'Wait in a cave, then race across!', size: 1, color: '#ffffff' },
  ])

  const onCourse = (x, s) => s > -0.5 && s < L + 60 && Math.abs(x) < 70
  let lastT = 0
  const activeBridges = new Set()

  return {
    id: 'w3',
    root,
    length: L,
    start: { x: wx(0), y: 0.3, z: wz(-8), facing: Math.PI },
    ground: (px, pz) => (bridgeAt(ls(pz)) ? 'lava' : 'lava'),
    onCourse: (px, pz) => onCourse(lx(px), ls(pz)),
    altitude: (p) => Math.max(0, ls(p.z) * 0.12),
    rule(px, pz, max, wishX, wishZ, sprint) {
      const x = lx(px)
      const s = ls(pz)
      if (!onCourse(x, s)) return null
      return { speed: mpsFor(max) * (sprint ? LANE.sprint : 1) }
    },
    trainAt(px, pz) {
      const s = ls(pz)
      if (s < 0 || !onCourse(lx(px), s)) return 1
      const o = outpostAt(s)
      return o === throne ? V.summitTrain : V.train[o.k]
    },
    nextGoal(max) {
      for (const b of bridges) if (b.need > max) return { max: b.need, name: b.k + 1 === throne.k ? 'Crater' : `Outpost ${b.k + 1}` }
      return null
    },
    hazard(p) {
      const x = lx(p.x)
      const s = ls(p.z)
      if (meteorHit) {
        meteorHit = false
        return { kind: 'meteor' }
      }
      if (!onCourse(x, s)) return null
      if (p.y < V.failY) return { kind: 'lava' }
      if (rollers.crushes(p.x, p.y, p.z)) return { kind: 'crush' }
      return null
    },
    padAt(p) {
      const x = lx(p.x)
      const s = ls(p.z)
      for (const o of outposts) {
        const pd = o.pad
        if (!pd) continue
        if (pd.summit ? Math.abs(x) < 7 && Math.abs(s - pd.s) < 3 : Math.abs(x - pd.x) < 2.7 && Math.abs(s - pd.s) < 2.4) return p.y < 1.2 ? pd : null
      }
      return null
    },
    fail,
    rollers,
    mode: () => rollers.mode(),
    // Every frame; returns events [{ type: 'shake', k } | boulder 'thump' / 'shatter'] for main.js.
    update(dt, t, p, active, stopped = false) {
      events.length = 0
      for (const m of timers) m.uniforms.t.value = t
      lastT = t
      if (!active) return events
      {
        const ps = ls(p.z)
        const dashing = ps > throne.s0 && ps < throne.s0 + B.spawnAt && Math.abs(lx(p.x)) < OH
        events.push(...rollers.update(dt, t, p, stopped, dashing))
      }
      player = p
      const x = lx(p.x)
      const s = ls(p.z)
      // stepping onto an idle bridge starts its collapse
      const onB = Math.abs(x) < HW + 0.5 && p.y > -1 ? bridgeAt(s) : null
      if (onB && onB.phase === 'idle' && s > onB.b0 + 0.6) {
        onB.phase = 'crack'
        onB.t = 0
        audio.bridgeCrack?.()
        activeBridges.add(onB)
      }
      for (const b of bridges) {
        for (const tile of b.tiles) {
          if (tile.holePending) {
            tile.holePending = false
            tile.hole = t + V.meteors.holeTime
            activeBridges.add(b)
          }
        }
      }
      for (const b of activeBridges) if (!updateBridge(b, dt, t, p)) activeBridges.delete(b)
      // meteors rain on the bridges you are crossing
      if (onB && onB.k >= V.meteors.from) {
        meteorTimer -= dt
        if (meteorTimer <= 0) {
          const f = (onB.k - V.meteors.from) / Math.max(1, bridges.length - 1 - V.meteors.from)
          meteorTimer = (V.meteors.every[0] + (V.meteors.every[1] - V.meteors.every[0]) * f) * rnd(0.8, 1.2)
          const ahead = Math.hypot(0, 1) * mpsFor(onB.need) * V.meteors.aimAhead
          const ts = Math.min(onB.b1 - 2, s + ahead * rnd(0.6, 1.4))
          const tx = rnd(-HW + 1.5, HW - 1.5)
          spawnMeteor(tx, ts)
        }
      } else meteorTimer = Math.min(meteorTimer, 1.2)
      for (const m of meteors) {
        if (!m.alive) continue
        m.t += dt
        const k = Math.min(1, m.t / V.meteors.warn)
        m.mesh.position.lerpVectors(m.from, m.to, k)
        m.mesh.rotation.x += dt * 6
        m.mesh.rotation.y += dt * 4
        const sc = V.meteors.radius * (0.6 + 0.4 * k)
        m.ring.scale.setScalar(sc * (1 + Math.sin(t * 18) * 0.06))
        m.dot.scale.setScalar(sc * k)
        if (Math.random() < 0.9) pools.fire.spawn({ ...fireParticle(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 2), vy: rnd(-1, 1), life: rnd(0.4, 0.8) })
        pools.smoke.spawn({ x: m.mesh.position.x, y: m.mesh.position.y, z: m.mesh.position.z, vx: 0, vy: 0.5, vz: 0, life: rnd(1, 1.6), c0: [0.2, 0.17, 0.17, 0.7], c1: [0.4, 0.38, 0.38, 0], s0: 1.5, s1: 4, drag: 0.5 })
        if (k >= 1) impact(m, p)
      }
      // geysers + eruptions
      for (const g of geysers) {
        g.t += dt
        if (g.t > g.every) {
          g.t = 0
          for (let i = 0; i < 40; i++) pools.fire.spawn({ ...fireParticle(g.x + rnd(-0.6, 0.6), 0.8, g.z + rnd(-0.6, 0.6), 1.5), vx: rnd(-1.2, 1.2), vy: rnd(10, 18), vz: rnd(-1.2, 1.2), gravity: -16, life: rnd(1, 1.6) })
          const d = Math.hypot(g.x - p.x, g.z - p.z)
          if (d < 50) audio.geyser?.(d)
        } else if (g.t > g.every - 1.2 && Math.random() < 0.5) pools.smoke.spawn({ x: g.x, y: 0.8, z: g.z, vx: rnd(-0.5, 0.5), vy: rnd(1, 3), vz: rnd(-0.5, 0.5), life: 1, c0: [0.5, 0.45, 0.45, 0.5], c1: [0.6, 0.55, 0.55, 0], s0: 1, s1: 3, drag: 1 })
      }
      eruptTimer -= dt
      if (eruptTimer <= 0) {
        eruptTimer = rnd(9, 16)
        for (let i = 0; i < 90; i++) pools.fire.spawn({ ...fireParticle(wx(rnd(-10, 10)), crater.y + 6, wz(crater.s + rnd(-10, 10)), 5), vx: rnd(-14, 14), vy: rnd(18, 40), vz: rnd(-14, 14), gravity: -16, life: rnd(1.6, 3) })
        audio.eruption?.()
        events.push({ type: 'shake', k: 0.35 })
      }
      core.rotation.y += dt * 0.6
      core.children[1].rotation.x += dt * 0.3
      core.position.y = 19 + Math.sin(t * 1.2) * 0.6
      for (const pad of pads) pad.material.emissiveIntensity = 0.35 + Math.sin(t * 4) * 0.15
      return events
    },
  }
}
