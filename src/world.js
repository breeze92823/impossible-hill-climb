import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,

  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { LOBBY } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { studMat } from './lobby/materials.js'

// The lobby ground: an asphalt hub with raised grass islands (white curbs)
// between the four roads, yellow centre dashes, the start pad decal and
// checkered band, terraced voxel cliffs all round (brown dirt in front, grey
// stone behind, lime caps) with blocky trees, grass tufts, rocks and flowers.
// The hill lane north of the band is lobby/lane.js.

const B = LOBBY.bounds
const C = LOBBY.colors
const rand = mulberry32(7331)
const R = (a, b) => a + rand() * (b - a)

// --- Islands: orthogonal polygons in (x, z), raised grass with a white curb --------
const ISLANDS = [
  // north-west, north-east (wrap round the start pad and the T roads)
  [[-5, -5], [-5, -44], [-16, -44], [-16, -62], [-70, -62], [-70, -24], [-36, -24], [-36, -5]],
  [[5, -5], [36, -5], [36, -24], [70, -24], [70, -62], [16, -62], [16, -44], [5, -44]],
  // south-west, south-east
  [[-5, 5], [-36, 5], [-36, 24], [-70, 24], [-70, 72], [-16, 72], [-16, 48], [-28, 48], [-28, 40], [-5, 40]],
  [[5, 5], [5, 40], [28, 40], [28, 48], [16, 48], [16, 72], [70, 72], [70, 24], [36, 24], [36, 5]],
]
const CURB_H = 0.2
const CURB_W = 0.5

function signedArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[(i + 1) % pts.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}
// Moves every edge `d` inward and re-intersects neighbours (exact for orthogonal polygons).
function inset(pts, d) {
  const s = signedArea(pts) > 0 ? 1 : -1
  const n = pts.length
  const lines = []
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % n]
    const len = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / len
    const dz = (bz - az) / len
    // inward normal: left of the edge for a CCW (positive area) polygon in x/z
    const nx = -dz * s
    const nz = dx * s
    lines.push({ px: ax + nx * d, pz: az + nz * d, dx, dz })
  }
  const out = []
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n]
    const l2 = lines[i]
    const den = l1.dx * l2.dz - l1.dz * l2.dx
    if (Math.abs(den) < 1e-6) {
      out.push([l2.px, l2.pz])
      continue
    }
    const t = ((l2.px - l1.px) * l2.dz - (l2.pz - l1.pz) * l2.dx) / den
    out.push([l1.px + l1.dx * t, l1.pz + l1.dz * t])
  }
  return out
}
function polyShape(pts) {
  const s = new Shape()
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)))
  s.closePath()
  return s
}
function slab(pts, height) {
  const g = new ExtrudeGeometry(polyShape(pts), { depth: height, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}
function trimeshCollider(geo) {
  const pos = geo.attributes.position.array
  const verts = new Float32Array(pos)
  let idx
  if (geo.index) idx = new Uint32Array(geo.index.array)
  else {
    idx = new Uint32Array(pos.length / 3)
    for (let i = 0; i < idx.length; i++) idx[i] = i
  }
  addFixed(RAPIER.ColliderDesc.trimesh(verts, idx), { x: 0, y: 0, z: 0 }, null, { friction: 0.9 })
}

function buildIslands(root) {
  const curb = studMat(C.curb, { roughness: 0.5 })
  const grass = studMat(C.grass, { roughness: 0.75 })
  for (const pts of ISLANDS) {
    const outer = slab(pts, CURB_H)
    const m1 = new Mesh(outer, curb)
    m1.receiveShadow = true
    root.add(m1)
    const top = new Mesh(slab(inset(pts, CURB_W), CURB_H + 0.02), grass)
    top.receiveShadow = true
    root.add(top)
    trimeshCollider(outer)
  }
}

// --- Flat surfaces --------------------------------------------------------------------
function buildFlats(root) {
  // Grass far beyond the hub (under the cliffs and down the closed lane).
  const far = new Mesh(new PlaneGeometry(900, 900), studMat(C.grass, { roughness: 0.8 }))
  far.rotation.x = -Math.PI / 2
  far.position.y = -0.02
  far.receiveShadow = true
  root.add(far)

  const w = B.maxX - B.minX
  const d = B.maxZ - B.minZ
  const asphalt = new Mesh(new PlaneGeometry(w, d), studMat(C.asphalt, { roughness: 0.85 }))
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.set((B.minX + B.maxX) / 2, 0.005, (B.minZ + B.maxZ) / 2)
  asphalt.receiveShadow = true
  root.add(asphalt)

  // Collision floor: one thick box under everything.
  addFixed(RAPIER.ColliderDesc.cuboid(450, 1, 450), { x: 0, y: -1, z: 0 }, null, { friction: 0.9 })
}

function buildDashes(root) {
  const mat = studMat(C.dash, { roughness: 0.5, emissive: C.dash, emissiveIntensity: 0.12 })
  const geo = new BoxGeometry(1, 0.04, 1)
  const list = []
  const along = (x0, z0, x1, z1, step, len) => {
    const total = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.floor(total / step)
    for (let i = 0; i <= n; i++) {
      const t = (i * step) / total
      list.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, sx: x1 === x0 ? 0.55 : len, sz: x1 === x0 ? len : 0.55 })
    }
  }
  along(0, -40, 0, -9, 7, 3) // north road
  along(0, 9, 0, 37, 7, 3) // south road
  along(-33, 0, -9, 0, 7, 3) // west road
  along(9, 0, 33, 0, 7, 3) // east road
  along(-40, -20, -40, 20, 7, 3) // west T
  along(40, -20, 40, 20, 7, 3) // east T
  along(-24, 44, 24, 44, 7, 3) // south T
  const inst = new InstancedMesh(geo, mat, list.length)
  const m = new Matrix4()
  list.forEach((p, i) => inst.setMatrixAt(i, m.compose(new Vector3(p.x, 0.03, p.z), new Quaternion(), new Vector3(p.sx, 1, p.sz))))
  inst.receiveShadow = true
  root.add(inst)
}

// --- Start pad: decal + checkered band -------------------------------------------------
function paintStartDecal() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 420
  const g = c.getContext('2d')
  const cx = 512
  const cy = 210
  // Speed-burst behind the word: a slanted orange->yellow lightning chevron.
  g.save()
  g.translate(cx, cy)
  g.rotate(-0.08)
  const grad = g.createLinearGradient(-300, 0, 300, 0)
  grad.addColorStop(0, '#ff3d1f')
  grad.addColorStop(0.5, '#ff9a1f')
  grad.addColorStop(1, '#ffe14a')
  g.fillStyle = grad
  g.strokeStyle = '#1a1030'
  g.lineWidth = 14
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(-330, -60)
  g.lineTo(60, -150)
  g.lineTo(20, -40)
  g.lineTo(330, -90)
  g.lineTo(-40, 160)
  g.lineTo(0, 40)
  g.lineTo(-330, 90)
  g.closePath()
  g.stroke()
  g.fill()
  g.restore()
  // The word.
  g.font = 'italic 700 200px Fredoka, "Arial Black", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = 34
  g.strokeStyle = '#13102a'
  g.strokeText('START!', cx, cy + 6)
  g.fillStyle = '#ffffff'
  g.fillText('START!', cx, cy + 6)
  return c
}
function paintChecker() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 32
  const g = c.getContext('2d')
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#1c1c22' : '#f6f6f6'
      g.fillRect(i * 16, j * 16, 16, 16)
    }
  }
  return c
}
function buildStartPad(root) {
  const P = LOBBY.startPad
  const tex = new CanvasTexture(paintStartDecal())
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const decal = new Mesh(
    new PlaneGeometry(24, 9.8),
    new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  )
  decal.rotation.x = -Math.PI / 2
  decal.position.set(0, 0.04, (P.minZ + P.maxZ) / 2 - 1)
  decal.receiveShadow = true
  root.add(decal)
  // Repaint once the font is in.
  document.fonts?.load?.('italic 700 200px Fredoka').then(() => {
    tex.image = paintStartDecal()
    tex.needsUpdate = true
  })

  const band = LOBBY.band
  const ck = new CanvasTexture(paintChecker())
  ck.colorSpace = SRGBColorSpace
  const strip = new Mesh(new PlaneGeometry(P.maxX - P.minX, band.maxZ - band.minZ), new MeshStandardMaterial({ map: ck, roughness: 0.6 }))
  strip.rotation.x = -Math.PI / 2
  strip.position.set(0, 0.035, (band.minZ + band.maxZ) / 2)
  strip.receiveShadow = true
  root.add(strip)
}

// --- Cliffs ------------------------------------------------------------------------------
// Columns of studded boxes on a 5 m grid in rings round the hub. Ring 0-1: brown
// dirt terraces; ring 2-4: tall grey stone. Every column wears a lime cap.
const CELL = 5
const RINGS = [
  { h: [2.5, 5], mat: 'dirt' },
  { h: [6, 10], mat: 'dirt' },
  { h: [11, 16], mat: 'stone' },
  { h: [16, 24], mat: 'stone' },
  { h: [22, 32], mat: 'stone' },
]

function cliffColumns() {
  const cols = []
  const half = LOBBY.laneMouth.halfWidth
  RINGS.forEach((ring, k) => {
    const d = CELL / 2 + k * CELL
    const minX = B.minX - d
    const maxX = B.maxX + d
    const minZ = B.minZ - d
    const maxZ = B.maxZ + d
    const push = (x, z) => {
      const h = R(ring.h[0], ring.h[1])
      const jx = rand() < 0.25 ? R(-1.2, 1.2) : 0
      const jz = rand() < 0.25 ? R(-1.2, 1.2) : 0
      cols.push({ x: x + jx, z: z + jz, h, mat: ring.mat, ring: k })
    }
    for (let x = minX; x <= maxX + 0.01; x += CELL) {
      push(x, maxZ) // south edge
      if (Math.abs(x) > half + d - CELL / 2) push(x, minZ) // north edge, open for the lane
    }
    for (let z = minZ + CELL; z <= maxZ - CELL + 0.01; z += CELL) {
      push(minX, z)
      push(maxX, z)
    }
  })
  return cols
}

function buildCliffs(root) {
  const cols = cliffColumns()
  const box = new BoxGeometry(1, 1, 1)
  box.translate(0, 0.5, 0)
  const groups = { dirt: [], stone: [] }
  for (const c of cols) groups[c.mat].push(c)
  const m = new Matrix4()
  const q = new Quaternion()
  const tint = new Color()
  const make = (list, mat, baseColor, spread) => {
    const inst = new InstancedMesh(box, mat, list.length)
    list.forEach((c, i) => {
      inst.setMatrixAt(i, m.compose(new Vector3(c.x, 0, c.z), q, new Vector3(CELL + 0.02, c.h, CELL + 0.02)))
      tint.set(baseColor).offsetHSL(R(-0.01, 0.01), R(-0.04, 0.04), R(-spread, spread))
      inst.setColorAt(i, tint)
    })
    inst.castShadow = true
    inst.receiveShadow = true
    root.add(inst)
  }
  make(groups.dirt, studMat('#ffffff', { roughness: 0.8 }), C.dirt, 0.04)
  make(groups.stone, studMat('#ffffff', { roughness: 0.8 }), C.stone, 0.05)

  // Lime caps.
  const caps = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.7 }), cols.length)
  cols.forEach((c, i) => {
    caps.setMatrixAt(i, m.compose(new Vector3(c.x, c.h, c.z), q, new Vector3(CELL + 0.3, 0.7, CELL + 0.3)))
    tint.set(C.grassCap).offsetHSL(R(-0.02, 0.02), 0, R(-0.03, 0.03))
    caps.setColorAt(i, tint)
  })
  caps.castShadow = true
  caps.receiveShadow = true
  root.add(caps)

  // Invisible walls round the hub's edges (open at the lane mouth).
  const wall = (cx, cz, hx, hz) => addFixed(RAPIER.ColliderDesc.cuboid(hx, 6, hz), { x: cx, y: 6, z: cz })
  wall(0, B.maxZ + 0.6, (B.maxX - B.minX) / 2 + 2, 0.6)
  wall(B.minX - 0.6, (B.minZ + B.maxZ) / 2, 0.6, (B.maxZ - B.minZ) / 2 + 2)
  wall(B.maxX + 0.6, (B.minZ + B.maxZ) / 2, 0.6, (B.maxZ - B.minZ) / 2 + 2)
  const half = LOBBY.laneMouth.halfWidth
  const side = (B.maxX - half) / 2
  wall(-(half + side), B.minZ - 0.6, side, 0.6)
  wall(half + side, B.minZ - 0.6, side, 0.6)
  return cols
}

// --- Trees, tufts, rocks, flowers ---------------------------------------------------------
function buildDecor(root, cols) {
  const trunkGeo = new CylinderGeometry(0.32, 0.55, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const cube = new BoxGeometry(1, 1, 1)
  const tuftGeo = new ConeGeometry(0.16, 1, 4)
  tuftGeo.translate(0, 0.5, 0)

  const trunks = []
  const leaves = []
  const tufts = []
  const rocks = []
  const tmp = new Object3D()
  const addTree = (x, y, z, s = 1) => {
    const h = R(4.5, 7.5) * s
    const lean = R(-0.18, 0.18)
    const leanDir = R(0, Math.PI * 2)
    trunks.push({ x, y, z, h, lean, leanDir })
    const tx = x + Math.sin(leanDir) * Math.sin(lean) * h
    const tz = z + Math.cos(leanDir) * Math.sin(lean) * h
    const ty = y + h * Math.cos(lean)
    const n = 4 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const sz = R(1.8, 3.4) * s
      leaves.push({ x: tx + R(-1.6, 1.6) * s, y: ty + R(-0.6, 1.8) * s, z: tz + R(-1.6, 1.6) * s, s: sz, rx: R(0, 1), ry: R(0, 3), rz: R(0, 1), c: C.leaves[Math.floor(rand() * C.leaves.length)] })
    }
  }
  const addTuft = (x, y, z, s = 1) => {
    const n = 4 + Math.floor(rand() * 4)
    for (let i = 0; i < n; i++) tufts.push({ x: x + R(-0.5, 0.5), y, z: z + R(-0.5, 0.5), h: R(0.7, 1.6) * s, tx: R(-0.35, 0.35), tz: R(-0.35, 0.35) })
  }
  for (const c of cols) {
    const top = c.h + 0.7
    const roll = rand()
    if (c.ring >= 1 && roll < 0.33) addTree(c.x + R(-1.2, 1.2), top, c.z + R(-1.2, 1.2), c.ring >= 3 ? 1.25 : 1)
    else if (roll < 0.6) addTuft(c.x + R(-1.8, 1.8), top, c.z + R(-1.8, 1.8), c.ring >= 2 ? 1.4 : 1)
    else if (c.ring >= 2 && roll < 0.72) {
      for (let i = 0; i < 3; i++) rocks.push({ x: c.x + R(-1.5, 1.5), y: top, z: c.z + R(-1.5, 1.5), s: R(0.6, 1.6), r: R(0, 1) })
    }
  }
  // Tufts along the cliff foot inside the hub.
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(rand() * 3)
    const x = side === 0 ? B.minX + R(1, 3) : side === 1 ? B.maxX - R(1, 3) : R(B.minX + 4, B.maxX - 4)
    const z = side === 2 ? B.maxZ - R(1, 3) : R(-20, 68)
    addTuft(x, CURB_H, z)
  }

  const m = new Matrix4()
  const trunkMesh = new InstancedMesh(trunkGeo, studMat(C.trunk, { roughness: 0.85, tile: 1.5 }), trunks.length)
  trunks.forEach((t, i) => {
    tmp.position.set(t.x, t.y - 0.3, t.z)
    tmp.rotation.set(Math.cos(t.leanDir) * t.lean, 0, -Math.sin(t.leanDir) * t.lean)
    tmp.scale.set(1, t.h + 0.6, 1)
    tmp.updateMatrix()
    trunkMesh.setMatrixAt(i, tmp.matrix)
  })
  trunkMesh.castShadow = true
  root.add(trunkMesh)

  const leafMesh = new InstancedMesh(cube, studMat('#ffffff', { roughness: 0.6, tile: 1.5 }), leaves.length)
  const col = new Color()
  leaves.forEach((l, i) => {
    tmp.position.set(l.x, l.y, l.z)
    tmp.rotation.set(l.rx, l.ry, l.rz)
    tmp.scale.setScalar(l.s)
    tmp.updateMatrix()
    leafMesh.setMatrixAt(i, tmp.matrix)
    leafMesh.setColorAt(i, col.set(l.c))
  })
  leafMesh.castShadow = true
  leafMesh.receiveShadow = true
  root.add(leafMesh)

  const tuftMesh = new InstancedMesh(tuftGeo, new MeshStandardMaterial({ color: '#58d43a', roughness: 0.6, flatShading: true }), tufts.length)
  tufts.forEach((t, i) => {
    tmp.position.set(t.x, t.y, t.z)
    tmp.rotation.set(t.tx, R(0, 3), t.tz)
    tmp.scale.set(1, t.h, 1)
    tmp.updateMatrix()
    tuftMesh.setMatrixAt(i, tmp.matrix)
  })
  tuftMesh.castShadow = true
  root.add(tuftMesh)

  const rockMesh = new InstancedMesh(cube, studMat('#8d8f97', { roughness: 0.9, tile: 1.5 }), rocks.length)
  rocks.forEach((r, i) => {
    tmp.position.set(r.x, r.y + r.s * 0.3, r.z)
    tmp.rotation.set(r.r * 0.4, r.r * 3, r.r * 0.3)
    tmp.scale.set(r.s * 1.3, r.s, r.s)
    tmp.updateMatrix()
    rockMesh.setMatrixAt(i, tmp.matrix)
  })
  rockMesh.castShadow = true
  root.add(rockMesh)

  // Little plus-shaped flowers on the grass islands.
  const petal = new BoxGeometry(0.7, 0.08, 0.22)
  const flowers = []
  const colors = ['#ffe14a', '#ffffff', '#ff4d6d']
  for (let i = 0; i < 90; i++) {
    const x = R(B.minX + 3, B.maxX - 3)
    const z = R(B.minZ + 3, B.maxZ - 3)
    // keep off roads and zones
    if (Math.abs(x) < 7 || Math.abs(z) < 7) continue
    if (z < -42 && Math.abs(x) < 18) continue
    if (Math.abs(x) > 34 && Math.abs(z) < 26) continue
    if (z > 38 && Math.abs(x) < 30) continue
    flowers.push({ x, z, c: colors[i % 3], r: R(0, Math.PI) })
  }
  const flowerMesh = new InstancedMesh(petal, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), flowers.length * 2)
  flowers.forEach((f, i) => {
    for (let k = 0; k < 2; k++) {
      tmp.position.set(f.x, CURB_H + 0.12, f.z)
      tmp.rotation.set(0, f.r + (k * Math.PI) / 2, 0)
      tmp.scale.setScalar(1)
      tmp.updateMatrix()
      flowerMesh.setMatrixAt(i * 2 + k, tmp.matrix)
      flowerMesh.setColorAt(i * 2 + k, col.set(f.c))
    }
  })
  flowerMesh.castShadow = true
  root.add(flowerMesh)
}

// --- Clouds -------------------------------------------------------------------------
function makeClouds() {
  const r = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcebff', emissiveIntensity: 0.62, fog: false })
  const group = new Group()
  for (let i = 0; i < 22; i++) {
    const ang = r() * Math.PI * 2
    const dist = 260 + r() * 170
    const cloud = new Group()
    const puffs = 5 + Math.floor(r() * 4)
    const len = 22 + r() * 26
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const rr = (1 - Math.abs(t) * 1.1) * (9 + r() * 6)
      const puff = new Mesh(geo, mat)
      puff.scale.set(rr, rr * 0.82, rr)
      puff.position.set(t * len, rr * 0.25 + r() * 3, (r() - 0.5) * 8)
      cloud.add(puff)
    }
    const flat = new Mesh(geo, mat)
    flat.scale.set(len * 0.62, 4, 9)
    cloud.add(flat)
    cloud.position.set(Math.cos(ang) * dist, 60 + r() * 70, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// Builds the whole lobby ground into `scene`; returns { update } (clouds drift).
export function createWorld(scene) {
  const root = new Group()
  root.name = 'lobby-ground'
  buildFlats(root)
  buildIslands(root)
  buildDashes(root)
  buildStartPad(root)
  const cols = buildCliffs(root)
  buildDecor(root, cols)
  const clouds = makeClouds()
  scene.add(root, clouds)
  return {
    root,
    clouds,
    update(dt) {
      clouds.rotation.y += dt * 0.004
    },
  }
}
export const ISLAND_TOP = CURB_H

