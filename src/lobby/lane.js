import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { BIKES, LANE, LOBBY } from '../config.js'
import { RAPIER, addFixed } from '../physics.js'
import { mulberry32 } from '../textures.js'
import { label } from '../propkit.js'
import { studMat, studTexture, triplanarize } from './materials.js'
import { rnd } from './fx.js'
import { createRider } from '../game/rider.js'
import { buildDefaultCharacter } from '../avatar/character.js'

// The hill lane north of the start band. Geometry is a run of straight slope
// segments that get steeper toward the top; s is metres along the lane from
// the band (world z = startZ - s), heightAt(s) the floor height there.
// Gameplay: safe caves on alternating sides with "+N Wins / Return" pads,
// boulders rolling down that flatten anyone on the open lane, the slope rule
// for the player's bike (speed from the Speed stat, slipping when too weak),
// and a couple of NPC riders that dash from cave to cave.

const HW = LANE.halfWidth
const CV = LANE.caves
const FLOOR_W = HW + CV.depth + 2 // floor half-width (reaches the cave backs)
const rand = mulberry32(9091)
const R = (a, b) => a + rand() * (b - a)
const deg = Math.PI / 180

// --- Profile ---------------------------------------------------------------------------
const N = LANE.segments
const L = N * LANE.segLen
const segAngle = []
const segH = [0]
for (let i = 0; i < N; i++) {
  const t = Math.pow(i / (N - 1), LANE.curve)
  segAngle.push((LANE.angle[0] + (LANE.angle[1] - LANE.angle[0]) * t) * deg)
  segH.push(segH[i] + Math.tan(segAngle[i]) * LANE.segLen)
}
export const laneLength = L
export const zAt = (s) => LANE.startZ - s
export const sAt = (z) => LANE.startZ - z
export function heightAt(s) {
  if (s <= 0) return 0
  if (s >= L) return segH[N]
  const i = Math.min(N - 1, Math.floor(s / LANE.segLen))
  return segH[i] + Math.tan(segAngle[i]) * (s - i * LANE.segLen)
}
export function angleAt(s) {
  if (s <= 0) return 0
  return segAngle[Math.min(N - 1, Math.floor(Math.min(s, L - 0.01) / LANE.segLen))]
}

// Caves: alternate sides, each gap a bit longer than the last.
export const caves = []
{
  let s = CV.first
  let k = 0
  while (s < L - 40) {
    caves.push({ s, side: k % 2 === 0 ? -1 : 1, wins: LANE.caveWins[Math.min(k, LANE.caveWins.length - 1)], index: k })
    s += CV.gap + CV.grow * k
    k++
  }
}
const inCaveSpan = (s, c, pad = 0) => Math.abs(s - c.s) < CV.width / 2 + pad
export function caveAt(s) {
  return caves.find((c) => inCaveSpan(s, c))
}

// --- Ride rule --------------------------------------------------------------------------
export function rideMax(speedStat) {
  const r = LANE.rideMax
  return Math.round(r.base + r.k * Math.log10(1 + Math.max(0, speedStat) / r.div))
}
export const mpsFor = (max) => LANE.mps.base + max * LANE.mps.per
// Per-cave tables (one value at each cave, `summit` at the top), linear in between from `start` at the band.
const atCave = (list, k) => list[Math.min(k, list.length - 1)]
function lerpTable(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [b, nb] = pts[i]
    if (s <= b) {
      const [a, na] = pts[i - 1]
      return na + ((nb - na) * (Math.max(s, a) - a)) / (b - a)
    }
  }
  return pts[pts.length - 1][1]
}
const table = (list, top, start) => [[0, start], ...caves.map((c) => [c.s, atCave(list, c.index)]), [L, top]]
// The summit dash zone (LANE.dash): from the last cave's mouth to past the spot where boulders spawn.
const lastCave = caves[caves.length - 1]
export const dashFrom = lastCave.s + CV.width / 2
const dashFoot = Math.sqrt(LANE.boulder.radius ** 2 - LANE.boulder.sink ** 2) * 0.8 // crush reach of a boulder
export const dashTo = L - LANE.boulder.spawnBack + dashFoot // past this the spawned boulder can't flatten you
// The need up there: a sprinting bike at MAX dash.max covers the zone in exactly dash.every seconds.
const dashNeed = (mpsFor(LANE.dash.max) * LANE.sprint * LANE.dash.max * LANE.dash.every) / (dashTo - dashFrom)
// MAX for full speed uphill at s (LANE.need, then the dash zone).
export const caveNeed = (c) => atCave(LANE.need.caves, c.index)
const needPts = [[0, LANE.need.caves[0] * 0.5], ...caves.map((c) => [c.s, caveNeed(c)]), [dashFrom, dashNeed], [L, dashNeed]]
export const needAt = (s) => lerpTable(needPts, s)
// The highest point the given MAX rides at full speed.
export function fullSpeedS(max) {
  if (needAt(0) > max) return 0
  let lo = 0
  let hi = L
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (needAt(mid) <= max) lo = mid
    else hi = mid
  }
  return lo
}
// The next goal for the given MAX: the first cave it can't ride at full speed, then the summit dash.
export function nextGoal(max) {
  for (const c of caves) if (caveNeed(c) > max) return { max: caveNeed(c), name: `Cave ${c.index + 1}` }
  return LANE.dash.max > max ? { max: LANE.dash.max, name: 'Summit' } : null
}
// Hill training multiplier at s (LANE.train), counted only up to fullSpeedS(max); 1 off the lane.
const trainPts = table(LANE.train.caves, LANE.train.summit, 1)
export const caveTrain = (c) => atCave(LANE.train.caves, c.index)
export const trainAt = (s, max = Infinity) => (s < 0 || s > L + 2 ? 1 : lerpTable(trainPts, Math.min(s, fullSpeedS(max))))

// --- Little helpers -------------------------------------------------------------------
function slopeQuat(s, yaw = 0) {
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angleAt(s))
  if (yaw) q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw))
  return q
}
function textSprite(height, w = 1024) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = 256
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  s.scale.set((height * w) / 256, height, 1)
  let last = ''
  s.userData.set = (text, color, outline = '#0d2b55', font = '700 150px Fredoka, "Arial Black", sans-serif') => {
    if (text === last) return
    last = text
    const g = c.getContext('2d')
    g.clearRect(0, 0, w, 256)
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.lineWidth = 22
    g.strokeStyle = outline
    g.strokeText(text, w / 2, 136)
    g.fillStyle = color
    g.fillText(text, w / 2, 136)
    tex.needsUpdate = true
  }
  return s
}

// =============================================================================
// Floor: one strip mesh (vertex-coloured: glowing red-hot at the bottom, then
// orange), studded via world-space UVs; the same triangles are the collider.
// =============================================================================
function buildFloor(root) {
  const STEP = 3
  const rows = Math.ceil(L / STEP) + 1
  const cols = [-FLOOR_W, -HW, -HW * 0.5, 0, HW * 0.5, HW, FLOOR_W]
  const pos = []
  const col = []
  const hot = new Color('#ff3b14')
  const warm = new Color('#ff7a22')
  const sand = new Color('#ff9a3c')
  const c = new Color()
  for (let r = 0; r < rows; r++) {
    const s = Math.min(L, r * STEP)
    const y = heightAt(s)
    const t = Math.min(1, s / 70)
    c.copy(hot).lerp(warm, t)
    if (s > 70) c.copy(warm).lerp(sand, Math.min(1, (s - 70) / 400))
    for (const x of cols) {
      pos.push(x, y, zAt(s))
      const edge = Math.abs(x) > HW ? 0.82 : 1 // cave floors a touch darker
      col.push(c.r * edge, c.g * edge, c.b * edge)
    }
  }
  const idx = []
  const w = cols.length
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < w - 1; k++) {
      const a = r * w + k
      idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const mat = triplanarize(new MeshStandardMaterial({ map: studTexture(), vertexColors: true, roughness: 0.7 }), LOBBY.studTile)
  const floor = new Mesh(g, mat)
  floor.receiveShadow = true
  root.add(floor)
  addFixed(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx)), { x: 0, y: 0, z: 0 }, null, { friction: 0.9 })

  // Heat glow over the bottom of the hill.
  const gc = document.createElement('canvas')
  gc.width = 4
  gc.height = 64
  const gg = gc.getContext('2d')
  const grad = gg.createLinearGradient(0, 64, 0, 0)
  grad.addColorStop(0, 'rgba(255,90,20,0.75)')
  grad.addColorStop(1, 'rgba(255,90,20,0)')
  gg.fillStyle = grad
  gg.fillRect(0, 0, 4, 64)
  const gt = new CanvasTexture(gc)
  gt.colorSpace = SRGBColorSpace
  const glow = new Mesh(new PlaneGeometry(HW * 2, 60), new MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, blending: AdditiveBlending, color: '#ff6a2a', polygonOffset: true, polygonOffsetFactor: -3 }))
  glow.quaternion.copy(slopeQuat(10)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))
  glow.position.set(0, heightAt(30) + 0.06, zAt(30))
  root.add(glow)

  // Darker scorched patches and loose rocks.
  const patchMat = new MeshStandardMaterial({ color: '#c8571a', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, transparent: true, opacity: 0.85 })
  for (let i = 0; i < 46; i++) {
    const s = R(12, L - 12)
    const x = R(-HW + 3, HW - 3)
    const shape = new Shape()
    const n = 7
    const rad = R(1.6, 4.2)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const rr = rad * R(0.7, 1.15)
      const px = Math.cos(a) * rr * 1.4
      const py = Math.sin(a) * rr
      if (k) shape.lineTo(px, py)
      else shape.moveTo(px, py)
    }
    const m = new Mesh(new ShapeGeometry(shape), patchMat)
    m.quaternion.copy(slopeQuat(s)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))
    m.rotateZ(R(0, Math.PI))
    m.position.set(x, heightAt(s) + 0.04, zAt(s))
    m.receiveShadow = true
    root.add(m)
  }
  const rockGeo = new BoxGeometry(1, 1, 1)
  const rocks = new InstancedMesh(rockGeo, studMat('#8b8e99', { tile: 0.8, roughness: 0.9 }), 60)
  const tmp = new Object3D()
  for (let i = 0; i < 60; i++) {
    const s = R(8, L - 8)
    const x = rand() < 0.5 ? R(-HW + 1, -HW + 5) * (rand() < 0.3 ? 0.3 : 1) : R(HW - 5, HW - 1)
    const sz = R(0.5, 1.3)
    tmp.position.set(x, heightAt(s) + sz * 0.3, zAt(s))
    tmp.rotation.set(R(0, 0.4), R(0, 3), R(0, 0.3))
    tmp.scale.set(sz * 1.5, sz * 0.8, sz)
    tmp.updateMatrix()
    rocks.setMatrixAt(i, tmp.matrix)
  }
  rocks.castShadow = rocks.receiveShadow = true
  root.add(rocks)
}

// =============================================================================
// Walls: terraced cliffs up both sides (instanced columns), caves cut into the
// inner rings, invisible colliders along the open edges.
// =============================================================================
const CELL = 5
const RINGS = [
  { h: [2.5, 5.5], mat: 'dirt' },
  { h: [6, 10], mat: 'dirt' },
  { h: [12, 17], mat: 'stone' },
  { h: [18, 26], mat: 'stone' },
  { h: [24, 34], mat: 'stone' },
]
function buildWalls(root) {
  const C = LOBBY.colors
  const list = []
  for (let s = CELL / 2; s < L + 30; s += CELL) {
    for (const side of [-1, 1]) {
      RINGS.forEach((ring, k) => {
        const off = HW + CELL / 2 + k * CELL
        // carve the caves out of the two inner rings
        if (CELL / 2 + k * CELL < CV.depth && caves.some((c) => c.side === side && inCaveSpan(s, c, CELL / 2 - 0.5))) return
        const base = heightAt(Math.min(s, L)) - 4
        const h = R(ring.h[0], ring.h[1]) + 4 + (s > L - 5 ? 10 : 0)
        list.push({ x: side * (off + (rand() < 0.2 ? R(-1, 1) : 0)), y: base, z: zAt(s), h, mat: ring.mat, k })
      })
    }
  }
  // Summit: a tall rock wall across the top end.
  for (let x = -HW - 10; x <= HW + 10; x += CELL) {
    for (let k = 0; k < 3; k++) list.push({ x, y: segH[N] - 2, z: zAt(L + 6 + k * CELL), h: R(14, 22) + k * 6, mat: 'stone', k: 3 })
  }
  const box = new BoxGeometry(1, 1, 1)
  box.translate(0, 0.5, 0)
  const m = new Matrix4()
  const q = new Quaternion()
  const tint = new Color()
  const make = (items, base, spread) => {
    const inst = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.8 }), items.length)
    items.forEach((c, i) => {
      inst.setMatrixAt(i, m.compose(new Vector3(c.x, c.y, c.z), q, new Vector3(CELL + 0.05, c.h, CELL + 0.05)))
      inst.setColorAt(i, tint.set(base).offsetHSL(R(-0.01, 0.01), R(-0.04, 0.04), R(-spread, spread)))
    })
    inst.castShadow = inst.receiveShadow = true
    root.add(inst)
  }
  make(list.filter((c) => c.mat === 'dirt'), C.dirt, 0.05)
  make(list.filter((c) => c.mat === 'stone'), C.stone, 0.05)
  const caps = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.7 }), list.length)
  list.forEach((c, i) => {
    caps.setMatrixAt(i, m.compose(new Vector3(c.x, c.y + c.h, c.z), q, new Vector3(CELL + 0.3, 0.7, CELL + 0.3)))
    caps.setColorAt(i, tint.set(C.grassCap).offsetHSL(R(-0.02, 0.02), 0, R(-0.03, 0.03)))
  })
  caps.castShadow = caps.receiveShadow = true
  root.add(caps)

  // Trees and grass tufts on the higher terraces.
  const trunkGeo = new CylinderGeometry(0.32, 0.55, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const tops = list.filter((c) => c.k >= 2 && rand() < 0.22)
  const trunks = new InstancedMesh(trunkGeo, studMat(C.trunk, { tile: 1.5 }), tops.length)
  const leaves = new InstancedMesh(new BoxGeometry(1, 1, 1), studMat('#ffffff', { tile: 1.5, roughness: 0.6 }), tops.length * 5)
  const tmp = new Object3D()
  tops.forEach((c, i) => {
    const h = R(4.5, 7.5)
    tmp.position.set(c.x, c.y + c.h + 0.4, c.z)
    tmp.rotation.set(R(-0.15, 0.15), 0, R(-0.15, 0.15))
    tmp.scale.set(1, h, 1)
    tmp.updateMatrix()
    trunks.setMatrixAt(i, tmp.matrix)
    for (let k = 0; k < 5; k++) {
      tmp.position.set(c.x + R(-1.6, 1.6), c.y + c.h + h + R(-0.5, 1.6), c.z + R(-1.6, 1.6))
      tmp.rotation.set(R(0, 1), R(0, 3), R(0, 1))
      tmp.scale.setScalar(R(1.8, 3.2))
      tmp.updateMatrix()
      leaves.setMatrixAt(i * 5 + k, tmp.matrix)
      leaves.setColorAt(i * 5 + k, tint.set(C.leaves[Math.floor(rand() * C.leaves.length)]))
    }
  })
  trunks.castShadow = leaves.castShadow = true
  root.add(trunks, leaves)
  const tuftGeo = new ConeGeometry(0.18, 1, 4)
  tuftGeo.translate(0, 0.5, 0)
  const tuftSpots = list.filter((c) => c.k <= 1 && rand() < 0.35)
  const tufts = new InstancedMesh(tuftGeo, new MeshStandardMaterial({ color: '#58d43a', roughness: 0.6, flatShading: true }), tuftSpots.length * 5)
  tuftSpots.forEach((c, i) => {
    for (let k = 0; k < 5; k++) {
      tmp.position.set(c.x + R(-1.5, 1.5), c.y + c.h + 0.35, c.z + R(-1.5, 1.5))
      tmp.rotation.set(R(-0.4, 0.4), R(0, 3), R(-0.4, 0.4))
      tmp.scale.set(1.2, R(0.9, 2.1), 1.2)
      tmp.updateMatrix()
      tufts.setMatrixAt(i * 5 + k, tmp.matrix)
    }
  })
  root.add(tufts)

  // Colliders: tall axis-aligned boxes along each open edge, gaps at the caves.
  const wallBox = (x0, x1, s0, s1) => {
    const top = Math.max(heightAt(s0), heightAt(s1))
    addFixed(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (top + 40) / 2, (s1 - s0) / 2), { x: (x0 + x1) / 2, y: (top + 40) / 2 - 6, z: zAt((s0 + s1) / 2) })
  }
  for (const side of [-1, 1]) {
    const own = caves.filter((c) => c.side === side)
    let s0 = 0
    for (const c of own) {
      const a = c.s - CV.width / 2
      const b = c.s + CV.width / 2
      if (a > s0) wallBox(side < 0 ? -HW - 3 : HW, side < 0 ? -HW : HW + 3, s0, a)
      // cave back + side walls
      const back = HW + CV.depth
      wallBox(side < 0 ? -back - 3 : back, side < 0 ? -back : back + 3, a, b)
      wallBox(side < 0 ? -back : HW, side < 0 ? -HW : back, a - 2, a)
      wallBox(side < 0 ? -back : HW, side < 0 ? -HW : back, b, b + 2)
      s0 = b
    }
    wallBox(side < 0 ? -HW - 3 : HW, side < 0 ? -HW : HW + 3, s0, L + 4)
  }
  wallBox(-HW - 3, HW + 3, L + 2, L + 6) // summit
}

// Cave dressing: dark rock back wall, a roof with hanging blocks and vines, the win pad.
function buildCave(root, c) {
  const g = new Group()
  root.add(g)
  const y = heightAt(c.s)
  const sx = c.side
  const back = HW + CV.depth
  const dark = studMat('#5d6685', { roughness: 0.9, tile: 1.4 })
  const purple = studMat('#6e5560', { roughness: 0.9, tile: 1.4 })
  const stone = studMat('#a3a3a8', { roughness: 0.85 })
  const vine = studMat('#5fd13a', { roughness: 0.6, tile: 1 })
  const q = slopeQuat(c.s)
  const place = (mesh, x, yy, s) => {
    mesh.position.set(x, yy, zAt(s))
    mesh.quaternion.copy(q)
    mesh.castShadow = mesh.receiveShadow = true
    g.add(mesh)
    return mesh
  }
  const W = CV.width + 3
  // back wall and side jambs
  place(new Mesh(new BoxGeometry(2, CV.height + 8, W), dark), sx * (back + 1), y + (CV.height + 8) / 2 - 2, c.s)
  // rock jambs either side of the mouth (grey outside, dark rock lining inside)
  for (const ds of [-1, 1]) {
    place(new Mesh(new BoxGeometry(CV.depth + 2, CV.height + 9, 4), stone), sx * (HW + CV.depth / 2 + 1), y + (CV.height + 9) / 2 - 2, c.s + ds * (CV.width / 2 + 2))
    place(new Mesh(new BoxGeometry(CV.depth, CV.height + 1, 0.6), purple), sx * (HW + CV.depth / 2 + 0.5), y + (CV.height + 1) / 2 - 0.5, c.s + ds * (CV.width / 2 + 0.05))
  }
  // roof slab: grey on top with a lime cap, dark underside
  place(new Mesh(new BoxGeometry(CV.depth + 3, 6, W + 5), stone), sx * (HW + CV.depth / 2 + 0.5), y + CV.height + 3, c.s)
  place(new Mesh(new BoxGeometry(CV.depth + 3.3, 0.7, W + 5.3), studMat(LOBBY.colors.grassCap)), sx * (HW + CV.depth / 2 + 0.5), y + CV.height + 6.3, c.s)
  place(new Mesh(new BoxGeometry(CV.depth, 0.5, CV.width), dark), sx * (HW + CV.depth / 2 + 0.5), y + CV.height - 0.2, c.s)
  // hanging blocks (dark, uneven) along the mouth and inside
  for (let i = 0; i < 50; i++) {
    const len = R(1, 3.4)
    const w = R(1, 2.6)
    const m = new Mesh(new BoxGeometry(w, len, R(1, 2.4)), rand() < 0.5 ? purple : dark)
    const x = sx * (HW + R(0.5, CV.depth - 0.5))
    place(m, x, y + CV.height - len / 2 + 0.1, c.s + R(-CV.width / 2, CV.width / 2))
  }
  // vines over the mouth
  for (let i = 0; i < 18; i++) {
    const len = R(1.5, 4.5)
    place(new Mesh(new BoxGeometry(0.25, len, 0.25), vine), sx * (HW + R(0.2, 1)), y + CV.height - len / 2, c.s + R(-CV.width / 2 + 1, CV.width / 2 - 1))
  }
  // win pad
  const padColor = c.index % 2 === 0 ? '#ffe11f' : '#ff2a2a'
  const pad = place(new Mesh(new BoxGeometry(5, 0.28, 4.4), studMat(padColor, { emissive: padColor, emissiveIntensity: 0.3, tile: 1 })), sx * (HW + 5.2), y + 0.16, c.s)
  const rim = place(new Mesh(new BoxGeometry(5.4, 0.18, 4.8), studMat('#7d6f9e', { tile: 1 })), sx * (HW + 5.2), y + 0.06, c.s)
  void rim
  const tag = new Group()
  const l1 = label(`+${c.wins} ${c.wins === 1 ? 'WIN' : 'WINS'}`, 1.1, { color: '#ffd21f', outline: '#3a1a00', outlineWidth: 14 })
  const l2 = label('Return', 0.7, { color: '#ffffff', outline: '#14112b', outlineWidth: 10 })
  l2.position.y = -0.9
  const l0 = label(`MAX ${caveNeed(c)} · x${caveTrain(c)} SPEED`, 0.8, { color: '#7fe0ff', outline: '#0b1a3a', outlineWidth: 10 })
  l0.position.y = 1.05
  tag.add(l0, l1, l2)
  tag.position.set(sx * (HW + 5.2), y + 4.2, zAt(c.s))
  g.add(tag)
  c.pad = { x: sx * (HW + 5.2), s: c.s, mesh: pad }
  return g
}

function buildSummit(root) {
  const y = segH[N]
  const pad = new Mesh(new BoxGeometry(HW * 1.6, 0.3, 6), studMat('#ffd21f', { emissive: '#ffb020', emissiveIntensity: 0.4, tile: 1 }))
  pad.position.set(0, y + 0.15, zAt(L - 4))
  pad.receiveShadow = true
  root.add(pad)
  const tag = new Group()
  const a = label(`🏆 SUMMIT +${LANE.summitWins} WINS`, 2.2, { color: '#ffd21f', outline: '#3a1a00', outlineWidth: 16 })
  const b = label(`DASH! MAX ${LANE.dash.max}`, 1.3, { color: '#7fe0ff', outline: '#0b1a3a', outlineWidth: 14 })
  b.position.y = 2.1
  tag.add(a, b)
  tag.position.set(0, y + 8, zAt(L - 4))
  root.add(tag)
  return { x: 0, s: L - 4, wins: LANE.summitWins, summit: true }
}

// =============================================================================
// Boulders
// =============================================================================
// Looks: body colours (base, darker patches), embedded chunk colours, extras.
export const BOULDER_LOOKS = {
  slate: { base: '#4f5b7d', shade: '#3b4563', chunks: ['#e8732c', '#e8732c', '#a8582a', '#c9c7e8'], band: '#9a5a2e', n: 26 },
  moss: { base: '#8f949c', shade: '#6c727c', chunks: ['#6fe03a', '#3fbf3f', '#a6f03a', '#5bd64a'], n: 34, big: true },
  granite: { base: '#a9aab3', shade: '#7f818c', chunks: ['#6d6f7a', '#8a8c96', '#5d5f69'], n: 30, flat: true },
  magma: { base: '#3a2d33', shade: '#2a2026', chunks: ['#ff6a1a', '#ffb020', '#7a2a12'], n: 30, glow: true },
  // World 2 / 3 (lobby/rollers.js)
  temple: { base: '#a8a27a', shade: '#8a8460', chunks: ['#5fd13a', '#3fbf3f', '#ffd21f'], n: 30, big: true, band: '#c9a23a' },
  vine: { base: '#6f7c5a', shade: '#55604a', chunks: ['#3fbf3f', '#2e9a34', '#a6f03a'], n: 34, big: true },
  obsidian: { base: '#241a2e', shade: '#1a1222', chunks: ['#c56bff', '#ff6a1a', '#3a2a4a'], n: 26, glow: true },
  ember: { base: '#4a2a22', shade: '#3a2018', chunks: ['#ffb020', '#ff4a12', '#7a2a12'], n: 30, glow: true, flat: true },
}
export const BOULDER_KINDS = ['slate', 'moss', 'granite', 'magma'] // the hill's own (the rest are World 2 / 3)

export function buildBoulderModel(kind, r = LANE.boulder.radius) {
  const look = BOULDER_LOOKS[kind]
  const ck = r / LANE.boulder.radius // chunk size scale
  const g = new Group()
  const geo = new IcosahedronGeometry(r, 2)
  // lumpy rock: push vertices in/out a little, consistently per shared position
  const p = geo.attributes.position
  const bump = new Map()
  const col = []
  const base = new Color(look.base)
  const shade = new Color(look.shade)
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const key = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`
    if (!bump.has(key)) bump.set(key, 1 + (Math.random() - 0.5) * 0.08)
    v.multiplyScalar(bump.get(key))
    p.setXYZ(i, v.x, v.y, v.z)
  }
  for (let f = 0; f < p.count; f += 3) {
    const c = Math.random() < 0.25 ? shade : base
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  geo.computeVertexNormals()
  const rock = new Mesh(geo, triplanarize(new MeshStandardMaterial({ map: studTexture(), vertexColors: true, roughness: 0.85, flatShading: true }), 1.6))
  rock.castShadow = true
  g.add(rock)
  // embedded chunks
  const mats = look.chunks.map((c) => studMat(c, { tile: 1, roughness: 0.7, emissive: look.glow && c !== '#7a2a12' ? c : undefined, emissiveIntensity: look.glow ? 1.2 : undefined }))
  const dir = new Vector3()
  for (let i = 0; i < look.n; i++) {
    dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    const sz = (look.big ? rnd(2.4, 4.6) : look.flat ? rnd(2.2, 4) : rnd(1.8, 3.6)) * ck
    const m = new Mesh(new BoxGeometry(sz, look.flat ? 0.5 : sz * rnd(0.5, 0.9), sz * rnd(0.7, 1.1)), mats[i % mats.length])
    m.position.copy(dir).multiplyScalar(r * (look.flat ? 1.0 : 0.97))
    m.lookAt(dir.clone().multiplyScalar(r * 2))
    m.rotateZ(rnd(0, Math.PI))
    if (look.flat) m.rotateX(Math.PI / 2)
    m.castShadow = true
    g.add(m)
  }
  if (look.band) {
    const band = new Mesh(new CylinderGeometry(r * 1.01, r * 1.01, 2.6 * ck, 32, 1, true), studMat(look.band, { tile: 1.2 }))
    band.material.side = DoubleSide
    band.rotation.z = 0.5
    g.add(band)
  }
  return g
}

// The speed sign that rides above every boulder: mode word + a face that gets angrier.
export function boulderSign() {
  const g = new Group()
  const word = textSprite(6.5)
  const face = textSprite(6, 256)
  face.position.y = 5.6
  g.add(word, face)
  g.userData.set = (m) => {
    word.userData.set(m.mode, m.color, '#0d2b55')
    face.userData.set(m.face, '#ffffff', 'rgba(0,0,0,0)', '700 180px "Segoe UI Emoji", "Apple Color Emoji", sans-serif')
  }
  g.userData.face = face
  return g
}

// =============================================================================
export function buildLane(scene, pools, audio = {}) {
  const root = new Group()
  root.name = 'lane'
  scene.add(root)
  buildFloor(root)
  buildWalls(root)
  for (const c of caves) buildCave(root, c)
  const summit = buildSummit(root)

  // The boulder speed cycles; each boulder keeps the mode it was launched with.
  const modes = LANE.boulder.modes
  let modeIndex = 0
  let modeTimer = modes[modeIndex].time

  // Boulders + debris pools.
  const boulders = []
  const B = LANE.boulder
  let spawnTimer = 3
  const rider = { s: -1, open: false, at: 0, dashing: false } // the player, as last seen by rule()
  const debris = []
  const chunkGeo = new BoxGeometry(1, 1, 1)
  const debrisMats = Object.fromEntries(BOULDER_KINDS.map((k) => [k, [studMat(BOULDER_LOOKS[k].base, { tile: 1 }), ...BOULDER_LOOKS[k].chunks.slice(0, 2).map((c) => studMat(c, { tile: 1 }))]]))
  const FOOT = Math.sqrt(B.radius * B.radius - B.sink * B.sink) // half-width where it meets the floor
  let lastKind = ''

  // --- Gravel: hundreds of little dirt/rock cubes flung off the contact patch,
  // bouncing and tumbling down the slope (one InstancedMesh). -------------------------
  const GRAVEL = 420
  const gravel = new InstancedMesh(new BoxGeometry(1, 1, 1), studMat('#ffffff', { tile: 0.6, roughness: 0.9 }), GRAVEL)
  gravel.castShadow = true
  gravel.frustumCulled = false
  const gP = new Float32Array(GRAVEL * 3)
  const gV = new Float32Array(GRAVEL * 3)
  const gR = new Float32Array(GRAVEL * 3)
  const gW = new Float32Array(GRAVEL * 3)
  const gSize = new Float32Array(GRAVEL)
  const gLife = new Float32Array(GRAVEL) // s left; 0 = free
  const gCols = ['#8a3a14', '#6e3a22', '#b5652e', '#5c4a3e', '#7d7f88', '#a9aab3'].map((c) => new Color(c))
  const gm = new Matrix4()
  const gq = new Quaternion()
  const ge = new Vector3()
  const gs = new Vector3()
  const gpos = new Vector3()
  const geu = new Euler()
  const zero = new Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < GRAVEL; i++) {
    gravel.setMatrixAt(i, zero)
    gravel.setColorAt(i, gCols[i % gCols.length])
  }
  root.add(gravel)
  let gNext = 0
  function flingGravel(x, y, z, vx, vy, vz, size = 1) {
    const i = gNext
    gNext = (gNext + 1) % GRAVEL
    gP[i * 3] = x
    gP[i * 3 + 1] = y
    gP[i * 3 + 2] = z
    gV[i * 3] = vx
    gV[i * 3 + 1] = vy
    gV[i * 3 + 2] = vz
    gR[i * 3] = rnd(0, 6)
    gR[i * 3 + 1] = rnd(0, 6)
    gR[i * 3 + 2] = rnd(0, 6)
    gW[i * 3] = rnd(-12, 12)
    gW[i * 3 + 1] = rnd(-12, 12)
    gW[i * 3 + 2] = rnd(-12, 12)
    gSize[i] = rnd(0.4, 1.1) * size
    gLife[i] = rnd(1.6, 2.6)
  }
  function updateGravel(dt) {
    for (let i = 0; i < GRAVEL; i++) {
      if (gLife[i] <= 0) continue
      gLife[i] -= dt
      if (gLife[i] <= 0) {
        gravel.setMatrixAt(i, zero)
        continue
      }
      const k = i * 3
      gV[k + 1] -= 24 * dt
      gP[k] += gV[k] * dt
      gP[k + 1] += gV[k + 1] * dt
      gP[k + 2] += gV[k + 2] * dt
      const floor = Math.max(0, heightAt(sAt(gP[k + 2]))) + gSize[i] * 0.5
      if (gP[k + 1] < floor) {
        gP[k + 1] = floor
        gV[k + 1] = Math.abs(gV[k + 1]) * 0.38
        gV[k] *= 0.72
        gV[k + 2] = gV[k + 2] * 0.72 + 1.5 // the slope keeps them trickling downhill
        gW[k] *= 0.7
        gW[k + 2] *= 0.7
      }
      for (let c = 0; c < 3; c++) gR[k + c] += gW[k + c] * dt
      const fade = Math.min(1, gLife[i] / 0.4)
      gq.setFromEuler(geu.set(gR[k], gR[k + 1], gR[k + 2]))
      gs.setScalar(gSize[i] * fade)
      gpos.set(gP[k], gP[k + 1], gP[k + 2])
      gravel.setMatrixAt(i, gm.compose(gpos, gq, gs))
    }
    gravel.instanceMatrix.needsUpdate = true
  }

  // --- Ruts: dark gouges left in the floor behind each boulder, fading out. ---------
  const RUTS = 260
  const ruts = new InstancedMesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: '#7a2c10', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), RUTS)
  ruts.receiveShadow = true
  ruts.frustumCulled = false
  const rutAge = new Float32Array(RUTS).fill(99)
  const rutW = new Float32Array(RUTS)
  const rutData = []
  for (let i = 0; i < RUTS; i++) {
    ruts.setMatrixAt(i, zero)
    rutData.push({ q: new Quaternion(), p: new Vector3(), len: 1 })
  }
  root.add(ruts)
  let rNext = 0
  const RUT_LIFE = 7
  function addRut(x, sPos, w, len) {
    const i = rNext
    rNext = (rNext + 1) % RUTS
    const d = rutData[i]
    d.q.copy(slopeQuat(sPos)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))
    d.p.set(x, heightAt(sPos) + 0.05, zAt(sPos))
    d.len = len
    rutW[i] = w
    rutAge[i] = 0
  }
  function updateRuts(dt) {
    for (let i = 0; i < RUTS; i++) {
      if (rutAge[i] >= RUT_LIFE) continue
      rutAge[i] += dt
      const d = rutData[i]
      const k = rutAge[i] >= RUT_LIFE ? 0 : 1 - Math.pow(rutAge[i] / RUT_LIFE, 2)
      ruts.setMatrixAt(i, gm.compose(d.p, d.q, gs.set(rutW[i] * k, d.len, 1)))
    }
    ruts.instanceMatrix.needsUpdate = true
  }

  // A point on the rim where the half-buried boulder meets the floor (dir +1 = downhill
  // front edge, -1 = the back edge it leaves behind), kept inside the lane walls.
  const rim = { x: 0, dz: 0 }
  function rimPoint(dir, spread = 1) {
    const x = rnd(-HW + 1.5, HW - 1.5) * spread
    rim.x = x
    rim.dz = dir * (Math.sqrt(Math.max(0, FOOT * FOOT - x * x)) + rnd(0.3, 1.6))
    return rim
  }
  // Dust in the floor's own colours: thick warm clouds that roll out sideways.
  function dirtCloud(x, y, z, big = 1) {
    const warm = Math.random()
    pools.smoke.spawn({
      x, y, z,
      vx: rnd(-3, 3) * big, vy: rnd(1.5, 4.5) * big, vz: rnd(0.5, 4) * big,
      life: rnd(1.2, 2.4),
      c0: [0.93 - warm * 0.12, 0.8 - warm * 0.14, 0.66 - warm * 0.12, 0.92],
      c1: [0.97, 0.93, 0.88, 0],
      s0: rnd(3, 5) * big, s1: rnd(8, 14) * big,
      drag: 1.4,
      wobble: 0.6,
    })
  }

  function spawnBoulder(forceKind = null, forceMode = null) {
    const mode = forceMode ?? modes[modeIndex]
    let kind = forceKind ?? BOULDER_KINDS[Math.floor(Math.random() * BOULDER_KINDS.length)]
    if (!forceKind && kind === lastKind) kind = BOULDER_KINDS[(BOULDER_KINDS.indexOf(kind) + 1) % BOULDER_KINDS.length]
    lastKind = kind
    let b = boulders.find((x) => !x.alive && x.kind === kind)
    if (!b) {
      b = { holder: new Group(), mesh: buildBoulderModel(kind), sign: boulderSign(), kind, alive: false }
      b.holder.add(b.mesh, b.sign)
      root.add(b.holder)
      boulders.push(b)
    }
    b.mode = mode
    b.sign.userData.set(mode)
    b.sign.position.y = B.radius + 4
    b.holder.visible = true
    b.alive = true
    b.s = L - B.spawnBack
    b.v = B.startSpeed * mode.speed
    b.max = B.maxSpeed * mode.speed
    b.x = rnd(-1, 1)
    b.wob = rnd(0, 10)
    b.mesh.rotation.set(0, rnd(0, 6), 0)
    audio.boulderSpawn?.()
    return b
  }

  function shatter(b) {
    b.alive = false
    b.holder.visible = false
    const y = heightAt(0) + B.sink + 2
    const z = zAt(0)
    for (let i = 0; i < 18; i++) {
      let d = debris.find((x) => !x.alive)
      if (!d) {
        d = { mesh: new Mesh(chunkGeo, debrisMats[0]), alive: false }
        d.mesh.castShadow = true
        root.add(d.mesh)
        debris.push(d)
      }
      d.alive = true
      d.t = 0
      d.mesh.material = debrisMats[b.kind][i % 3]
      const s = rnd(1, 3)
      d.size = s
      d.mesh.scale.setScalar(s)
      d.mesh.visible = true
      d.mesh.position.set(b.x + rnd(-6, 6), y + rnd(-3, 4), z + rnd(-4, 2))
      d.v = new Vector3(rnd(-9, 9), rnd(4, 13), rnd(4, 16))
      d.spin = new Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6))
    }
    for (let i = 0; i < 160; i++) {
      const a = rnd(0, Math.PI * 2)
      const sp = rnd(6, 20)
      flingGravel(b.x + rnd(-8, 8), y + rnd(-1, 4), z + rnd(-4, 3), Math.cos(a) * sp, rnd(6, 18), Math.abs(Math.sin(a)) * sp + 4, 1.6)
    }
    for (let i = 0; i < 40; i++) dirtCloud(b.x + rnd(-FOOT, FOOT), rnd(0.5, 4), z + rnd(-6, 6), 1.6)
    for (let i = 0; i < 70; i++) {
      pools.smoke.spawn({ x: b.x + rnd(-9, 9), y: rnd(0.5, 6), z: z + rnd(-6, 4), vx: rnd(-5, 5), vy: rnd(1, 5), vz: rnd(0, 8), life: rnd(1, 2.2), c0: [0.85, 0.66, 0.5, 0.75], c1: [0.95, 0.85, 0.75, 0], s0: rnd(1.5, 3), s1: rnd(5, 9), drag: 1.6 })
    }
    return { x: b.x, y, z }
  }

  return {
    root,
    summit,
    boulders,
    mode: () => modes[modeIndex].mode,
    // Dev: drop a boulder at s (metres up the lane).
    spawnAt(s) {
      spawnBoulder()
      const b = boulders.find((x) => x.alive && x.s === L - B.spawnBack)
      if (b) b.s = s
    },
    // The new-player intro: one boulder of a chosen look, s m up the lane, rolling at a
    // constant v m/s (so the cutscene can time the chase), wearing the given mode's sign.
    cinematic(s, v, kind = 'magma', modeName = 'VERY FAST') {
      const b = spawnBoulder(kind, modes.find((m) => m.mode === modeName) ?? modes[modes.length - 1])
      b.s = s
      b.v = b.max = v
      return b
    },
    // Removes every rolling boulder at once (skipping the intro).
    clear() {
      for (const b of boulders) {
        b.alive = false
        b.holder.visible = false
      }
    },
    // The player's move rule on the hill (null off it).
    rule(px, pz, max, wishX, wishZ, sprint) {
      const s = sAt(pz)
      if (s < 0 || s > L + 2) return null
      const v = mpsFor(max) * (sprint ? LANE.sprint : 1)
      rider.s = s
      rider.open = Math.abs(px) <= HW - 0.2
      rider.at = performance.now()
      if (!rider.open) return { speed: v } // in a cave: safe and flat-ish
      // Always forward: a bike weaker than the slope just climbs slower (never stops or slides).
      const up = Math.min(1, Math.max(LANE.need.minUp, max / needAt(s)))
      const uphill = Math.max(0, -wishZ) // north is uphill
      return { speed: v * (1 - uphill * (1 - up)) }
    },
    // dt, t, list of riders on the hill [{ x, z, alive }] -> crush test results via callbacks
    update(dt, t, stopped) {
      // mode cycle
      modeTimer -= dt
      if (modeTimer <= 0) {
        modeIndex = (modeIndex + 1) % modes.length
        modeTimer = modes[modeIndex].time
      }
      // spawning. Summit dash: once the player rides out above the last cave, the next boulder
      // comes exactly dash.every s later (and every dash.every s while they stay up there).
      const dashing = rider.open && rider.s > dashFrom && rider.s < L && performance.now() - rider.at < 400
      if (dashing && !rider.dashing) spawnTimer = LANE.dash.every
      rider.dashing = dashing
      if (!stopped) {
        spawnTimer -= dt
        if (spawnTimer <= 0) {
          spawnTimer = dashing ? LANE.dash.every : modes[modeIndex].every * rnd(0.85, 1.2)
          spawnBoulder()
        }
      }
      const events = []
      for (const b of boulders) {
        if (!b.alive) continue
        const a = angleAt(b.s)
        b.v = Math.min(b.max, b.v + 9.8 * Math.sin(a) * B.gravity * dt)
        b.s -= b.v * dt
        b.x = Math.sin(t * 0.7 + b.wob) * 1
        const floor = heightAt(Math.max(0, b.s))
        const y = floor + B.sink // sunk into the lane: it fills the lane wall to wall
        // Thumps: once per half turn the lumpy rock drops onto a flat face and
        // hops: a jolt, a ring of dirt and a spray of gravel.
        b.roll = (b.roll || 0) + b.v * dt
        b.hopV = (b.hopV || 0) - 30 * dt
        b.hop = Math.max(0, (b.hop || 0) + b.hopV * dt)
        if (b.hop === 0 && b.hopV < 0) {
          if (b.hopV < -3) {
            const k = Math.min(1, -b.hopV / 9)
            for (let i = 0; i < 30 * k; i++) {
              const dir = Math.random() < 0.65 ? 1 : -1
              const r = rimPoint(dir)
              dirtCloud(b.x + r.x, floor + 0.5, zAt(b.s) + r.dz, 1.2)
            }
            for (let i = 0; i < 45 * k; i++) {
              const dir = Math.random() < 0.7 ? 1 : -1
              const r = rimPoint(dir)
              flingGravel(b.x + r.x, floor + 0.6, zAt(b.s) + r.dz, r.x * rnd(0.2, 0.6), rnd(5, 13) * k, dir * rnd(3, 10) + b.v * 0.4, 1.3)
            }
            events.push({ type: 'thump', at: { x: b.x, y: floor, z: zAt(b.s) }, strength: k })
          }
          b.hopV = 0
        }
        if (b.roll > Math.PI * B.radius * 0.5) {
          b.roll = 0
          b.hopV = rnd(4, 7) * Math.min(1.4, 0.5 + b.v / 25)
        }
        b.holder.position.set(b.x, y + b.hop, zAt(b.s))
        b.mesh.rotateOnWorldAxis(new Vector3(1, 0, 0), (b.v / B.radius) * dt)
        b.mesh.rotation.z = Math.sin(t * 2.3 + b.wob) * 0.04 // a slight wobble as it rolls
        b.sign.userData.face.position.y = 5.6 + Math.sin(t * 3 + b.wob) * 0.5
        // Grinding contact: dirt clouds boiling off both edges and the front, gravel
        // spraying out sideways and pebbles skipping downhill ahead of it.
        const zc = zAt(b.s)
        const pace = Math.min(2, 0.9 + b.v / 16)
        b.dirtAcc = (b.dirtAcc || 0) + dt * 34 * pace
        while (b.dirtAcc >= 1) {
          b.dirtAcc -= 1
          const roll = Math.random()
          if (roll < 0.35) {
            // the corners where the rock grinds against the walls: thick boiling clouds
            const side = Math.random() < 0.5 ? -1 : 1
            const r = rimPoint(1, 1)
            dirtCloud(b.x + side * (HW - rnd(0.5, 3)), floor + rnd(0.5, 4), zc + Math.abs(r.dz) * rnd(0.2, 0.6), 1.1)
          } else if (roll < 0.8) {
            const r = rimPoint(1) // bow wave pushed ahead
            dirtCloud(b.x + r.x, floor + 0.4, zc + r.dz, 0.9)
          } else {
            const r = rimPoint(-1) // settling dust behind
            dirtCloud(b.x + r.x, floor + 0.6, zc + r.dz, 0.8)
          }
        }
        b.gravAcc = (b.gravAcc || 0) + dt * 70 * pace
        while (b.gravAcc >= 1) {
          b.gravAcc -= 1
          if (Math.random() < 0.6) {
            const r = rimPoint(-1) // flung up off the back as the rock rolls over it
            flingGravel(b.x + r.x, floor + 0.5, zc + r.dz, r.x * rnd(0.1, 0.4), rnd(4, 11), -rnd(2, 6))
          } else {
            const r = rimPoint(1) // skipping ahead downhill
            flingGravel(b.x + r.x, floor + 0.4, zc + r.dz, r.x * rnd(0, 0.25), rnd(2, 6), b.v * rnd(1, 1.35) + 2, 0.8)
          }
        }
        // ruts: two deep edge gouges and a pressed centre track
        b.rutAcc = (b.rutAcc || 0) + b.v * dt
        if (b.rutAcc > 1.6) {
          b.rutAcc = 0
          const sr = b.s + FOOT * 0.55
          if (sr < L - 2) {
            addRut(b.x - FOOT * 0.72, sr, 2.6, 2.2)
            addRut(b.x + FOOT * 0.72, sr, 2.6, 2.2)
            addRut(b.x, sr, FOOT * 0.9, 2.2)
          }
        }
        if (b.s <= 0) events.push({ type: 'shatter', at: shatter(b) })
      }
      updateGravel(dt)
      updateRuts(dt)
      // debris physics
      for (const d of debris) {
        if (!d.alive) continue
        d.t += dt
        d.v.y -= 22 * dt
        d.mesh.position.addScaledVector(d.v, dt)
        const ground = Math.max(0, heightAt(sAt(d.mesh.position.z))) + d.size * 0.4
        if (d.mesh.position.y < ground) {
          d.mesh.position.y = ground
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
    // Is a rider at (x, z) being flattened right now?
    crushes(x, z, y) {
      const s = sAt(z)
      if (s < -1 || Math.abs(x) > HW - 0.3) return false
      for (const b of boulders) {
        if (!b.alive) continue
        if (Math.abs(s - b.s) < FOOT * 0.8 && y < heightAt(Math.max(0, b.s)) + B.sink + B.radius) return true
      }
      return false
    },
    // Distances for the rumble sound.
    nearest(x, y, z) {
      const out = []
      for (const b of boulders) {
        if (!b.alive) continue
        const p = b.holder.position
        out.push({ distance: Math.hypot(p.x - x, p.y - y, p.z - z), speed: b.v, pan: Math.max(-1, Math.min(1, (p.x - x) / 30)) })
      }
      return out
    },
  }
}

// =============================================================================
// NPC riders dashing up the hill from cave to cave (now and then one gets flattened).
// =============================================================================
export function createLaneRiders(scene, lane, names, audio = {}) {
  const riders = names.map((name, i) => {
    const r = createRider(scene, { pools: null })
    r.setBike(BIKES[(i * 3 + 1) % 5])
    r.setAvatar(buildDefaultCharacter())
    const tag = label(name, 0.42, { color: '#e9ecf5', outline: '#1d2236', outlineWidth: 8 })
    tag.position.y = 2.9
    r.group.add(tag)
    return { r, name, s: -4 - i * 6, x: (i - 0.5) * 6, k: 0, state: 'ride', timer: i * 3, facing: Math.PI, reckless: false, v: 10 + i * 2 }
  })
  function reset(n) {
    n.s = rnd(-8, -3)
    n.x = rnd(-6, 6)
    n.k = 0
    n.state = 'wait'
    n.timer = rnd(1, 4)
    n.r.group.scale.set(1, 1, 1)
    n.reckless = Math.random() < 0.25
  }
  return {
    update(dt, t, onCrush) {
      for (const n of riders) {
        let speed = 0
        if (n.state === 'wait') {
          n.timer -= dt
          if (n.timer <= 0) n.state = 'ride'
        } else if (n.state === 'crushed') {
          n.timer -= dt
          n.r.group.scale.set(1.5, 0.14, 1.5)
          if (n.timer <= 0) reset(n)
        } else {
          const cave = caves[Math.min(n.k, caves.length - 1)]
          const tx = n.state === 'hide' || Math.abs(n.s - cave.s) < 12 ? cave.side * (HW + 6) : 0
          const ts = cave.s
          if (n.state === 'ride') {
            const ds = ts - n.s
            const dx = tx - n.x
            const d = Math.hypot(ds, dx)
            speed = n.v
            if (d < 1.5) {
              n.state = 'hide'
              n.timer = rnd(1.5, 3)
            } else {
              const step = Math.min(d, speed * dt)
              n.s += (ds / d) * step
              n.x += (dx / d) * step
              n.facing = Math.atan2(dx, -ds)
            }
          } else if (n.state === 'hide') {
            n.timer -= dt
            const danger = lane.boulders.some((b) => b.alive && b.s > n.s - LANE.boulder.radius)
            if (n.timer <= 0 && (!danger || n.reckless)) {
              n.k++
              if (n.k >= caves.length || n.k > 3 + (n.name.length % 3)) {
                audio.npcClaim?.()
                reset(n)
              } else n.state = 'ride'
            }
          }
          const y = heightAt(n.s)
          if (n.state !== 'crushed' && lane.crushes(n.x, zAt(n.s), y)) {
            n.state = 'crushed'
            n.timer = LANE.crushSeconds
            onCrush?.({ x: n.x, y, z: zAt(n.s) })
          }
        }
        n.r.update(dt, t, { x: n.x, y: heightAt(n.s), z: zAt(n.s), facing: n.facing, speed, distance: speed * dt, grounded: true })
      }
    },
  }
}
