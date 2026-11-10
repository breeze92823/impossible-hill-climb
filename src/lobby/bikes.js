// Procedural motorcycles for the lobby garage, the featured rings and the
// player's ride. Chunky glossy-plastic look: rounded boxes, bevelled side
// profiles (extruded Shapes), chrome bits, fat rubber tyres.
//
// Conventions: the bike faces +Z, the tyres touch y = 0, x is lateral. Each
// wheel's rotating parts sit in one Group (userData.wheels[i]) that turns about
// its local X axis; spinWheels() rolls them. Geometries and materials are
// cached and shared between bikes, so never dispose them per bike.
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fontReady, neon } from '../propkit.js'

const TAU = Math.PI * 2
const UP = new Vector3(0, 1, 0)
const FONT = '"Fredoka", "Arial Black", sans-serif'

// --- Caches -------------------------------------------------------------------
const geos = new Map()
const mats = new Map()
const texs = new Map()
function cached(map, k, make) {
  let v = map.get(k)
  if (v === undefined) {
    v = make()
    map.set(k, v)
  }
  return v
}
const key = (...a) => a.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v))).join('|')

// --- Materials ----------------------------------------------------------------
const paint = (c, metalness = 0.08, roughness = 0.35) =>
  cached(mats, key('paint', c, metalness, roughness), () => new MeshStandardMaterial({ color: c, roughness, metalness }))
const sheet = (c, metalness = 0.08) =>
  cached(mats, key('sheet', c, metalness), () => new MeshStandardMaterial({ color: c, roughness: 0.35, metalness, side: DoubleSide }))
const metal = (c = '#4a4e57', roughness = 0.4) =>
  cached(mats, key('metal', c, roughness), () => new MeshStandardMaterial({ color: c, roughness, metalness: 0.75 }))
const CHROME = () => cached(mats, 'chrome', () => new MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.2, metalness: 0.9 }))
const RUBBER = () => cached(mats, 'rubber', () => new MeshStandardMaterial({ color: '#1d1d22', roughness: 0.88, metalness: 0 }))
const PLASTIC = () => cached(mats, 'plastic', () => new MeshStandardMaterial({ color: '#25272d', roughness: 0.5, metalness: 0.05 }))
const LEATHER = (c = '#1f1c1c') => cached(mats, key('leather', c), () => new MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0 }))
const emit = (c, e, intensity, roughness = 0.2) =>
  cached(mats, key('emit', c, e, intensity), () => new MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: intensity, roughness }))
const HEAD = () => emit('#ffffff', '#fff3d6', 1.6, 0.15)
const TAIL = () => emit('#ff2a2a', '#ff1010', 1.4)
const AMBER = () => emit('#ffb020', '#ff9000', 0.9)
const glass = (c) =>
  cached(mats, key('glass', c), () => new MeshStandardMaterial({ color: c, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.55, depthWrite: false }))
const glowMat = (c) => cached(mats, key('neon', c), () => neon(c))

// --- Geometries ---------------------------------------------------------------
const box = (w, h, d) => cached(geos, key('box', w, h, d), () => new BoxGeometry(w, h, d))
const rbox = (w, h, d, r = 0.02) =>
  cached(geos, key('rbox', w, h, d, r), () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))
const cyl = (rt, rb, h, seg = 16) => cached(geos, key('cyl', rt, rb, h, seg), () => new CylinderGeometry(rt, rb, h, seg))
const cylX = (r, len, seg = 20) => cached(geos, key('cylX', r, len, seg), () => new CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2))
const cylZ = (r, len, seg = 20) => cached(geos, key('cylZ', r, len, seg), () => new CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2))
const sphere = (r, w = 18, h = 12) => cached(geos, key('sph', r, w, h), () => new SphereGeometry(r, w, h))
// Torus in the YZ plane (axle along X). Angles run from +Z towards +Y; arc starts at +Z.
const torusX = (R, t, rs = 10, ts = 40, arc = TAU) =>
  cached(geos, key('torX', R, t, rs, ts, arc), () => new TorusGeometry(R, t, rs, ts, arc).rotateY(-Math.PI / 2))
// Torus facing +Z (a ring you look at from the front).
const torusZ = (R, t, rs = 8, ts = 32, arc = TAU) => cached(geos, key('torZ', R, t, rs, ts, arc), () => new TorusGeometry(R, t, rs, ts, arc))
// Open cylinder segment with its axis along X: fenders/mudguards. Angle from +Z towards +Y.
const shell = (R, width, start, arc) =>
  cached(geos, key('shell', R, width, start, arc), () => new CylinderGeometry(R, R, width, 32, 1, true, start, arc).rotateZ(Math.PI / 2))

function shapeOf(pts) {
  const s = new Shape()
  s.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3])
    else s.lineTo(p[0], p[1])
  }
  return s
}
// Side-profile slab: pts are [z, y] (or [cz, cy, z, y] quadratic segments),
// extruded across x, centred on x = 0, total width `width` including the bevel.
function slab(name, pts, width, bevel = 0.03) {
  return cached(geos, key('slab', name, width, bevel), () => {
    const depth = Math.max(0.002, width - 2 * bevel)
    const g = new ExtrudeGeometry(shapeOf(pts), {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 12,
    })
    g.rotateY(-Math.PI / 2) // shape x -> +z, extrusion -> -x
    g.translate(depth / 2, 0, 0)
    return g
  })
}
// Flat copy of a slab outline facing -X with UVs normalised to its bounding box
// (flip mirrors u for the right-hand side). geometry.userData.bb is the [z, y] box.
function profileDecalGeo(name, pts, flip) {
  return cached(geos, key('pdecal', name, flip), () => {
    const g = new ShapeGeometry(shapeOf(pts), 12)
    g.computeBoundingBox()
    const bb = g.boundingBox.clone()
    const pos = g.attributes.position
    const uv = g.attributes.uv
    const w = bb.max.x - bb.min.x
    const h = bb.max.y - bb.min.y
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) - bb.min.x) / w
      uv.setXY(i, flip ? 1 - u : u, (pos.getY(i) - bb.min.y) / h)
    }
    g.rotateY(-Math.PI / 2)
    g.userData.bb = { minZ: bb.min.x, maxZ: bb.max.x, minY: bb.min.y, maxY: bb.max.y }
    return g
  })
}
function merged(k, build) {
  return cached(geos, k, () => {
    const parts = build()
    const g = mergeGeometries(parts.map(([geo, m]) => geo.clone().applyMatrix4(m)))
    for (const [geo] of parts) geo.dispose()
    return g
  })
}
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz))
function rodMatrix(a, b, stretch = true) {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = d.length()
  const q = new Quaternion().setFromUnitVectors(UP, d.divideScalar(len || 1))
  const mid = new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  return new Matrix4().compose(mid, q, new Vector3(1, stretch ? len : 1, 1))
}
// Point on a wheel-plane circle: angle from +Z towards +Y.
const onCircle = (a, r, x = 0) => [x, r * Math.sin(a), r * Math.cos(a)]

// --- Placement helpers ----------------------------------------------------------
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  if (rx || ry || rz) m.rotation.set(rx, ry, rz)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}
function orient(obj, a, b) {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = d.length()
  obj.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  obj.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1))
  return len
}
function rod(parent, a, b, r, mat, seg = 12) {
  const m = add(parent, cyl(r, r, 1, seg), mat)
  m.scale.y = orient(m, a, b)
  return m
}
// Bent tube through points (rods + ball joints).
function bent(parent, pts, r, mat, seg = 12) {
  for (let i = 1; i < pts.length; i++) rod(parent, pts[i - 1], pts[i], r, mat, seg)
  for (let i = 1; i < pts.length - 1; i++) add(parent, sphere(r, seg, 8), mat, ...pts[i])
}
// Rounded bar whose length runs a -> b (w across x-ish, d the other way).
function beam(parent, a, b, w, d, mat) {
  const m = add(parent, rbox(w, 1, d, Math.min(w, d) * 0.3), mat)
  m.scale.y = orient(m, a, b)
  return m
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const SIDES = [-1, 1]

// --- Canvas decals ------------------------------------------------------------
const decalJobs = []
fontReady.then(() => {
  for (const j of decalJobs) {
    j.draw()
    j.tex.needsUpdate = true
  }
})
function canvasTex(k, w, h, painter) {
  return cached(texs, k, () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    const draw = () => {
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      painter(ctx, w, h)
    }
    draw()
    decalJobs.push({ draw, tex })
    return tex
  })
}
const decalMat = (tex) =>
  cached(mats, 'decal' + tex.uuid, () => new MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 0.35,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }))
function raceNumber(def) {
  const s = String(def.id ?? def.body + def.accent)
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return 1 + (h % 98)
}
function isLight(hex) {
  const n = parseInt(String(hex).slice(1), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150
}
// Number-plate style number on a transparent canvas (dirt plates).
function numberTex(num, ink, stripe) {
  return canvasTex(key('num', num, ink, stripe), 256, 192, (ctx, w, h) => {
    ctx.fillStyle = stripe
    ctx.fillRect(0, 0, w, 26)
    ctx.font = `700 150px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 10
    ctx.strokeStyle = '#ffffff'
    ctx.strokeText(String(num), w / 2, h * 0.58)
    ctx.fillStyle = ink
    ctx.fillText(String(num), w / 2, h * 0.58)
  })
}
// Mirrored pair of decals on a slab's two flat faces. painter(ctx, W, H, P, flip)
// draws in world [z, y] coordinates through P.
function profileDecals(parent, name, pts, width, texKey, painter, W = 512, H = 512) {
  for (const flip of [false, true]) {
    const geo = profileDecalGeo(name, pts, flip)
    const { minZ, maxZ, minY, maxY } = geo.userData.bb
    const tex = canvasTex(key(texKey, flip), W, H, (ctx, w, h) => {
      const P = ([z, y]) => {
        const px = ((z - minZ) / (maxZ - minZ)) * w
        return [flip ? w - px : px, (1 - (y - minY) / (maxY - minY)) * h]
      }
      painter(ctx, w, h, P, (maxZ - minZ) / w)
    })
    const m = add(parent, geo, decalMat(tex), flip ? width / 2 + 0.002 : -(width / 2 + 0.002))
    if (flip) m.scale.x = -1
  }
}
function polyPath(ctx, P, pts) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [x, y] = P(p)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.closePath()
}

// --- Wheels -------------------------------------------------------------------
function knobGeo(r, tube, w) {
  return merged(key('knobs', r, tube, w), () => {
    const parts = []
    const n = Math.round((TAU * r) / 0.075)
    const blk = new BoxGeometry(tube * w * 0.95, 0.045, 0.055)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const side = i % 2 ? 1 : -1
      const [, y, z] = onCircle(a, r - 0.012)
      parts.push([blk, mat4(side * tube * w * 0.42, y, z, Math.PI / 2 - a)])
    }
    return parts
  })
}
function castSpokeGeo(inner, n = 5) {
  return merged(key('cast', inner, n), () => {
    const parts = []
    const len = inner - 0.06
    const spoke = new BoxGeometry(0.026, len, 0.04)
    for (let i = 0; i < n; i++) {
      for (const off of [-0.11, 0.11]) {
        const a = (i / n) * TAU + off
        const [, y, z] = onCircle(a, 0.06 + len / 2)
        parts.push([spoke, mat4(0, y, z, Math.PI / 2 - a)])
      }
    }
    return parts
  })
}
function wireSpokeGeo(inner, hubW, n = 32) {
  return merged(key('wire', inner, hubW, n), () => {
    const parts = []
    const sp = new CylinderGeometry(0.0055, 0.0055, 1, 5)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const side = i % 2 ? 1 : -1
      const lace = (i % 4 < 2 ? 1 : -1) * 0.55
      const hub = onCircle(a + lace, 0.05, side * hubW * 0.5)
      const rim = onCircle(a, inner - 0.012, side * 0.012)
      parts.push([sp, rodMatrix(hub, rim)])
    }
    return parts
  })
}
function notchGeo(inner, halfW, n = 8) {
  return merged(key('notch', inner, halfW, n), () => {
    const parts = []
    const b = new BoxGeometry(halfW * 1.7, 0.03, 0.035)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const [, y, z] = onCircle(a, inner + 0.004)
      parts.push([b, mat4(0, y, z, Math.PI / 2 - a)])
    }
    return parts
  })
}
function holesGeo(r, n, w) {
  return merged(key('holes', r, n, w), () => {
    const parts = []
    const c = new CylinderGeometry(0.03, 0.03, w, 12).rotateZ(Math.PI / 2)
    for (let i = 0; i < n; i++) {
      const [, y, z] = onCircle((i / n) * TAU, r)
      parts.push([c, mat4(0, y, z)])
    }
    return parts
  })
}

// o: { r, tube, w (tyre width scale), rim, style: cast|wire|disc|hubless,
//      knobby, discs: [x...], sprocket: { x, r }, glow, cradle }
function wheel(o) {
  const { r, tube, w = 1, rim, style = 'cast', knobby = false, discs = [], sprocket = null, glow = null } = o
  const spin = new Group()
  spin.name = 'wheelSpin'
  const rc = r - tube
  const inner = r - 2 * tube
  const halfW = tube * w
  const tire = add(spin, torusX(rc, tube, 14, 48), RUBBER())
  tire.scale.x = w
  if (knobby) add(spin, knobGeo(r, tube, w), RUBBER())
  else {
    // a raised centre tread line keeps road tyres from looking like donuts
    const tread = add(spin, torusX(r - 0.006, 0.012, 6, 48), PLASTIC())
    tread.scale.x = w * 0.8
  }
  const rimMat = paint(rim, 0.45, 0.28)
  if (style === 'hubless') {
    const liner = add(spin, torusX(inner + 0.012, 0.024, 8, 48), PLASTIC())
    liner.scale.x = (halfW * 0.9) / 0.024
    const ring = add(spin, torusX(inner + 0.002, 0.018, 8, 56), glowMat(glow ?? rim))
    ring.scale.x = (halfW * 0.65) / 0.018
    for (const s of SIDES) {
      const side = add(spin, torusX(rc, 0.008, 6, 56), glowMat(glow ?? rim), s * (halfW + 0.001))
    }
    add(spin, notchGeo(inner, halfW), PLASTIC())
  } else {
    const band = add(spin, torusX(inner + 0.006, 0.02, 8, 48), rimMat)
    band.scale.x = (halfW * 0.85) / 0.02
    const hubW = Math.max(0.1, halfW * 1.25)
    add(spin, cylX(0.055, hubW, 18), metal('#5b6069', 0.35))
    add(spin, cylX(0.034, hubW + 0.05, 14), CHROME())
    if (style === 'cast') add(spin, castSpokeGeo(inner), rimMat)
    else if (style === 'wire') add(spin, wireSpokeGeo(inner, hubW), CHROME())
    else if (style === 'disc') {
      const dw = Math.max(0.05, halfW * 0.7)
      add(spin, cylX(inner - 0.004, dw, 36), rimMat)
      add(spin, holesGeo(inner * 0.58, 5, dw + 0.008), PLASTIC())
      add(spin, cylX(0.07, dw + 0.03, 20), CHROME())
    }
  }
  const discR = inner * 0.86
  for (const x of discs) {
    add(spin, cylX(discR, 0.012, 32), metal('#b9bec7', 0.3), x)
    add(spin, cylX(discR * 0.55, 0.02, 16), metal('#3c4048', 0.35), x)
  }
  if (sprocket) add(spin, cylX(sprocket.r, 0.016, 26), metal('#8d939c', 0.3), sprocket.x)
  return { spin, discR, inner }
}
function mount(bike, wh, z, y) {
  const g = new Group()
  g.position.set(0, y, z)
  g.add(wh.spin)
  bike.add(g)
  return g
}
// Brake caliper hugging a disc (static, mounted on the fork/swingarm).
function caliper(parent, z, y, x, discR, angle, color = '#d4202a') {
  const [, dy, dz] = onCircle(angle, discR - 0.02)
  add(parent, rbox(0.035, 0.06, 0.1, 0.012), paint(color, 0.3, 0.3), x, y + dy, z + dz, Math.PI / 2 - angle)
}
// Telescopic fork: two legs from the axle to the top clamp, thicker upper tubes.
function fork(parent, axle, top, x, upperMat, lowerMat, rUp = 0.032, rLow = 0.024, split = 0.45) {
  for (const s of SIDES) {
    const a = [s * x, axle[1], axle[2]]
    const t = [s * x, top[1], top[2]]
    const m = lerp3(a, t, split)
    rod(parent, a, m, rLow, lowerMat)
    rod(parent, lerp3(a, t, split - 0.04), t, rUp, upperMat)
    add(parent, sphere(rLow * 1.25, 12, 8), lowerMat, ...a)
  }
  add(parent, cylX(0.02, x * 2 + 0.04, 10), metal('#8d939c', 0.3), 0, axle[1], axle[2])
}
function clamp(parent, at, x, mat, depth = 0.09) {
  add(parent, rbox(x * 2 + 0.08, 0.04, depth, 0.015), mat, at[0] ?? 0, at[1], at[2])
}
function grips(parent, ends, mat = RUBBER()) {
  // ends: [[inner], [outer]] for the +x side; mirrored to -x
  for (const s of SIDES) {
    const a = [s * ends[0][0], ends[0][1], ends[0][2]]
    const b = [s * ends[1][0], ends[1][1], ends[1][2]]
    rod(parent, a, b, 0.026, mat, 12)
    add(parent, sphere(0.024, 10, 8), CHROME(), ...lerp3(a, b, 1.08))
    // brake / clutch lever in front of the grip
    const la = lerp3(a, b, -0.1)
    const lb = lerp3(a, b, 0.9)
    la[2] += 0.035
    lb[2] += 0.065
    lb[1] -= 0.01
    rod(parent, la, lb, 0.007, metal('#b9bec7', 0.3), 6)
  }
}
function mirrors(parent, base, head, round = false, bodyMat = PLASTIC()) {
  for (const s of SIDES) {
    const a = [s * base[0], base[1], base[2]]
    const b = [s * head[0], head[1], head[2]]
    rod(parent, a, b, 0.009, CHROME(), 8)
    if (round) {
      add(parent, cylZ(0.055, 0.025, 20), CHROME(), b[0], b[1] + 0.03, b[2])
      add(parent, cylZ(0.047, 0.004, 20), glass('#9fc2e0'), b[0], b[1] + 0.03, b[2] - 0.014)
    } else {
      add(parent, rbox(0.13, 0.065, 0.05, 0.02), bodyMat, b[0] + s * 0.03, b[1] + 0.02, b[2])
      add(parent, box(0.11, 0.045, 0.004), glass('#9fc2e0'), b[0] + s * 0.03, b[1] + 0.02, b[2] - 0.027)
    }
  }
}
function roundHeadlight(parent, x, y, z, r, shellMat = CHROME()) {
  add(parent, sphere(r * 1.05, 20, 14), shellMat, x, y, z - r * 0.25).scale.set(1, 1, 0.85)
  add(parent, cylZ(r * 0.9, 0.03, 24), HEAD(), x, y, z + r * 0.62)
  add(parent, torusZ(r * 0.93, r * 0.12, 8, 28), CHROME(), x, y, z + r * 0.62)
}
function footpegs(parent, y, z, x, mat = metal('#8d939c', 0.3)) {
  for (const s of SIDES) {
    add(parent, rbox(0.05, 0.08, 0.05, 0.012), mat, s * (x - 0.02), y + 0.03, z)
    add(parent, cylX(0.019, 0.12, 10), RUBBER(), s * (x + 0.05), y, z)
  }
}
function chain(parent, x, f, fr, r, rr) {
  // f / r = [z, y] of the sprocket centres, fr / rr their radii
  const m = metal('#2e3036', 0.4)
  rod(parent, [x, f[1] + fr, f[0]], [x, r[1] + rr, r[0]], 0.011, m, 6)
  rod(parent, [x, f[1] - fr, f[0]], [x, r[1] - rr, r[0]], 0.011, m, 6)
  add(parent, cylX(fr, 0.02, 16), metal('#8d939c', 0.3), x, f[1], f[0])
}
function coilGeo(len, r) {
  return merged(key('coil', len, r), () => {
    const parts = []
    const ring = new TorusGeometry(r, 0.009, 6, 16).rotateX(Math.PI / 2)
    const n = Math.max(4, Math.round(len / 0.028))
    for (let i = 0; i < n; i++) parts.push([ring, mat4(0, -len / 2 + (i + 0.5) * (len / n), 0, 0.12, 0, 0)])
    return parts
  })
}
function shock(parent, a, b, springColor) {
  rod(parent, a, b, 0.016, CHROME(), 10)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const s = add(parent, coilGeo(len * 0.7, 0.036), paint(springColor, 0.3, 0.3))
  orient(s, a, b)
  const cap = add(parent, cyl(0.03, 0.03, 1, 12), metal('#3c4048', 0.35))
  cap.scale.y = orient(cap, lerp3(a, b, 0.76), lerp3(a, b, 0.98))
}
function finGeo(r, h) {
  return merged(key('fins', r, h), () => {
    const parts = [[new CylinderGeometry(r * 0.75, r * 0.75, h, 18), mat4(0, 0, 0)]]
    const fin = new CylinderGeometry(r, r, 0.012, 20)
    const n = Math.round(h / 0.03)
    for (let i = 0; i < n; i++) parts.push([fin, mat4(0, -h / 2 + (i + 0.5) * (h / n), 0)])
    return parts
  })
}
// Classic V-twin: crankcase, two finned cylinders in a V, chrome heads + covers.
function vtwin(parent, z, y, accentMat) {
  const caseMat = metal('#7c828c', 0.3)
  add(parent, cylX(0.16, 0.26, 24), caseMat, 0, y, z)
  for (const s of SIDES) {
    add(parent, cylX(0.12, 0.02, 24), CHROME(), s * 0.14, y, z + 0.01)
    add(parent, cylX(0.05, 0.03, 14), accentMat, s * 0.155, y, z + 0.01)
  }
  add(parent, rbox(0.22, 0.2, 0.3, 0.05), caseMat, 0, y - 0.01, z - 0.24)
  for (const [lean, dz] of [[0.52, 0.07], [-0.52, -0.07]]) {
    const base = [0, y + 0.12, z + dz]
    const c = add(parent, finGeo(0.085, 0.28), metal('#2f3238', 0.45))
    c.rotation.x = lean
    c.position.set(0, base[1] + 0.14 * Math.cos(lean), base[2] + 0.14 * Math.sin(lean))
    const hd = add(parent, rbox(0.2, 0.07, 0.2, 0.025), CHROME())
    hd.rotation.x = lean
    hd.position.set(0, base[1] + 0.31 * Math.cos(lean), base[2] + 0.31 * Math.sin(lean))
  }
  // air cleaner (right) and pushrod tubes
  add(parent, cylX(0.11, 0.05, 28), CHROME(), 0.17, y + 0.24, z)
  add(parent, cylX(0.04, 0.06, 12), accentMat, 0.2, y + 0.24, z)
}
function teardropGeo(len, rmax) {
  return cached(geos, key('tear', len, rmax), () => {
    const pts = []
    const n = 18
    for (let i = 0; i <= n; i++) {
      const t = i / n
      pts.push(new Vector2(Math.max(0.001, rmax * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.35)), 0.55)), t * len - len / 2))
    }
    return new LatheGeometry(pts, 28).rotateX(Math.PI / 2) // +Y (fat end) -> +Z (front)
  })
}

// --- Styles -----------------------------------------------------------------------
// Each returns { front, rear, rf, rr, seat, bars, pegs }.

function buildSport(g, def) {
  const body = paint(def.body)
  const acc = paint(def.accent)
  const rf = 0.35, rr = 0.35, zf = 0.72, zr = -0.7
  const fw = wheel({ r: rf, tube: 0.075, rim: def.rim, style: 'cast', discs: [-0.07, 0.07] })
  const rw = wheel({ r: rr, tube: 0.085, w: 1.4, rim: def.rim, style: 'cast', discs: [0.095], sprocket: { x: -0.125, r: 0.13 } })
  const front = mount(g, fw, zf, rf)
  const rear = mount(g, rw, zr, rr)

  // upside-down fork: dark stanchions up top, gold sliders down low
  const axle = [0, rf, zf]
  const top = [0, 1.0, 0.45]
  fork(g, axle, top, 0.1, metal('#2b2d33', 0.35), metal('#d9a520', 0.3), 0.034, 0.025, 0.42)
  clamp(g, top, 0.1, metal('#3c4048', 0.3))
  for (const s of SIDES) caliper(g, zf, rf, s * 0.07, fw.discR, 2.3, '#d9a520')
  caliper(g, zr, rr, 0.095, rw.discR, 3.6)
  // front mudguard
  add(g, shell(rf + 0.03, 0.16, 0.95, 1.35), sheet(def.body), 0, rf, zf)

  // fairing
  const fairing = [
    [0.8, 0.9],
    [0.78, 1.02, 0.64, 1.08],
    [0.4, 1.02],
    [0.12, 0.95],
    [-0.02, 0.78],
    [0.02, 0.5],
    [-0.06, 0.32],
    [0.1, 0.22],
    [0.3, 0.24],
    [0.36, 0.42],
    [0.42, 0.72, 0.66, 0.8],
    [0.8, 0.84],
  ]
  const fw2 = 0.4
  add(g, slab('sportFairing', fairing, fw2, 0.035), body)
  const num = raceNumber(def)
  const ink = '#14161c'
  profileDecals(g, 'sportFairing', fairing, fw2, key('sportDecal', def.body, def.accent, num), (ctx, w, h, P, mpp) => {
    // two-tone belly
    polyPath(ctx, P, [[0.37, 0.44], [0.3, 0.2], [0.08, 0.18], [-0.1, 0.3], [-0.04, 0.42], [0.2, 0.36]])
    ctx.fillStyle = def.accent
    ctx.fill()
    // swept stripes from the nose
    polyPath(ctx, P, [[0.84, 0.9], [0.84, 0.83], [0.4, 0.62], [-0.04, 0.56], [-0.04, 0.63], [0.38, 0.69]])
    ctx.fillStyle = def.accent
    ctx.fill()
    polyPath(ctx, P, [[0.84, 0.8], [0.84, 0.77], [0.4, 0.57], [-0.04, 0.5], [-0.04, 0.53], [0.4, 0.6]])
    ctx.fillStyle = isLight(def.accent) ? ink : '#ffffff'
    ctx.fill()
    // gills
    ctx.fillStyle = 'rgba(10,12,18,0.7)'
    for (let k = 0; k < 3; k++) {
      polyPath(ctx, P, [[0.06 + k * 0.07, 0.3], [0.1 + k * 0.07, 0.3], [0.16 + k * 0.07, 0.45], [0.12 + k * 0.07, 0.45]])
      ctx.fill()
    }
    // race number roundel
    const [cx, cy] = P([0.25, 0.81])
    const rad = 0.105 / mpp
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, TAU)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = rad * 0.14
    ctx.strokeStyle = isLight(def.accent) ? ink : def.accent
    ctx.stroke()
    ctx.font = `700 ${Math.round(rad * 1.25)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = ink
    ctx.fillText(String(num), cx, cy + rad * 0.08)
  })
  // tank
  add(g, slab('sportTank', [[0.4, 0.96], [0.36, 1.14, 0.18, 1.16], [0.0, 1.16, -0.08, 1.02], [-0.06, 0.92], [0.3, 0.92]], 0.34, 0.05), body)
  add(g, cyl(0.035, 0.035, 0.02, 14), metal('#9aa0a8', 0.3), 0, 1.205, 0.2, -0.1)
  // tail unit + seat + pillion cowl
  add(g, slab('sportTail', [[-0.04, 0.94], [-0.06, 0.66], [-0.45, 0.74], [-0.95, 0.99], [-0.98, 1.05], [-0.7, 1.06], [-0.5, 0.94], [-0.42, 0.84], [-0.08, 0.84]], 0.3, 0.03), body)
  add(g, rbox(0.27, 0.06, 0.4, 0.025), LEATHER(), 0, 0.865, -0.25)
  add(g, rbox(0.22, 0.05, 0.24, 0.02), acc, 0, 1.03, -0.62, 0.54)
  add(g, rbox(0.15, 0.04, 0.03, 0.01), TAIL(), 0, 1.02, -1.0, 0.3)
  // plate hanger + indicators
  rod(g, [0, 0.9, -0.85], [0, 0.7, -1.02], 0.012, PLASTIC(), 8)
  add(g, rbox(0.17, 0.11, 0.012, 0.004), paint('#eceff2'), 0, 0.66, -1.03)
  for (const s of SIDES) {
    rod(g, [s * 0.04, 0.82, -0.94], [s * 0.11, 0.82, -0.96], 0.007, PLASTIC(), 6)
    add(g, rbox(0.04, 0.025, 0.035, 0.008), AMBER(), s * 0.12, 0.82, -0.96)
  }
  // rear hugger
  add(g, shell(rr + 0.025, 0.2, 0.9, 1.4), sheet('#25272d'), 0, rr, zr)
  // windscreen, headlights, ram-air
  add(g, slab('sportScreen', [[0.68, 1.06], [0.46, 1.27], [0.4, 1.25], [0.52, 1.06]], 0.3, 0.012), glass('#33415e'))
  for (const s of SIDES) add(g, rbox(0.11, 0.045, 0.05, 0.015), HEAD(), s * 0.09, 0.925, 0.81, 0, -s * 0.35)
  add(g, rbox(0.07, 0.06, 0.04, 0.015), PLASTIC(), 0, 0.9, 0.82)
  mirrors(g, [0.17, 1.06, 0.56], [0.24, 1.1, 0.53], false, body)
  // clip-on bars
  for (const s of SIDES) rod(g, [s * 0.09, 0.99, 0.46], [s * 0.2, 0.975, 0.42], 0.016, metal('#3c4048', 0.3), 10)
  grips(g, [[0.2, 0.975, 0.42], [0.3, 0.955, 0.395]])
  // swingarm, pivot plate, shock, chain, engine bits, exhaust
  const arm = metal('#a7adb6', 0.3)
  for (const s of SIDES) beam(g, [s * 0.155, 0.45, -0.1], [s * 0.155, rr, zr], 0.04, 0.09, arm)
  add(g, rbox(0.36, 0.3, 0.12, 0.03), arm, 0, 0.55, -0.08)
  add(g, cylX(0.03, 0.4, 12), CHROME(), 0, 0.45, -0.1)
  add(g, cylX(0.026, 0.36, 12), CHROME(), 0, rr, zr)
  add(g, rbox(0.32, 0.22, 0.34, 0.05), metal('#33363d', 0.45), 0, 0.38, 0.14)
  shock(g, [0, 0.46, -0.3], [0, 0.78, -0.14], isLight(def.accent) ? '#ffcc1a' : def.accent)
  chain(g, -0.125, [-0.08, 0.45], 0.05, [zr, rr], 0.13)
  const ti = metal('#b7bcc4', 0.25)
  bent(g, [[0, 0.19, 0.32], [0.1, 0.18, -0.05], [0.16, 0.3, -0.25], [0.16, 0.72, -0.5], [0.08, 0.83, -0.66]], 0.03, ti)
  add(g, rbox(0.2, 0.09, 0.3, 0.035), ti, 0, 0.86, -0.78, 0.48)
  for (const s of SIDES) add(g, cylZ(0.024, 0.06, 14), PLASTIC(), s * 0.05, 0.93, -0.93, 0.48)
  footpegs(g, 0.48, -0.2, 0.17)

  return { front, rear, rf, rr, seat: { y: 0.895, z: -0.25 }, bars: { y: 0.965, z: 0.41 }, pegs: { y: 0.48, z: -0.2 } }
}

function buildDirt(g, def) {
  const body = paint(def.body)
  const frameMat = paint(def.accent, 0.3, 0.4)
  const rf = 0.4, rr = 0.38, zf = 0.8, zr = -0.68
  const fw = wheel({ r: rf, tube: 0.065, rim: def.rim, style: 'wire', knobby: true, discs: [0.07] })
  const rw = wheel({ r: rr, tube: 0.08, w: 1.15, rim: def.rim, style: 'wire', knobby: true, discs: [0.085], sprocket: { x: -0.115, r: 0.11 } })
  const front = mount(g, fw, zf, rf)
  const rear = mount(g, rw, zr, rr)

  // long-travel fork with guards
  const axle = [0, rf, zf]
  const top = [0, 1.18, 0.52]
  fork(g, axle, top, 0.095, metal('#2b2d33', 0.35), CHROME(), 0.036, 0.022, 0.45)
  const lowClamp = lerp3(axle, top, 0.75)
  clamp(g, top, 0.095, metal('#8d939c', 0.3))
  clamp(g, lowClamp, 0.095, metal('#8d939c', 0.3))
  for (const s of SIDES) {
    const p = lerp3([s * 0.095, rf, zf], [s * 0.095, top[1], top[2]], 0.22)
    const guard = add(g, rbox(0.03, 0.22, 0.07, 0.012), body, s * 0.12, p[1], p[2] + 0.02)
    guard.rotation.x = -Math.atan2(zf - top[2], top[1] - rf)
  }
  caliper(g, zf, rf, 0.07, fw.discR, 2.4, '#2b2d33')
  caliper(g, zr, rr, 0.085, rw.discR, 3.7, '#2b2d33')
  // high front fender
  add(g, slab('dirtFender', [[0.42, 0.9], [0.62, 0.94], [0.92, 0.95, 1.16, 0.8], [1.15, 0.77], [0.9, 0.89, 0.62, 0.89], [0.42, 0.86]], 0.17, 0.015), body)
  // number plate + small headlight
  const num = raceNumber(def)
  const plateTilt = -Math.atan2(zf - top[2], top[1] - rf)
  const plate = new Group()
  plate.position.set(0, 1.14, 0.63)
  plate.rotation.x = plateTilt
  g.add(plate)
  add(plate, rbox(0.3, 0.26, 0.03, 0.03), paint('#f4f4f4'), 0, 0, 0)
  const nTex = numberTex(num, '#14161c', def.body)
  const nf = add(plate, cached(geos, 'plate', () => new PlaneGeometry(0.24, 0.18)), decalMat(nTex), 0, 0.02, 0.017)
  add(plate, rbox(0.09, 0.05, 0.03, 0.012), HEAD(), 0, -0.1, 0.02)
  // exposed frame
  const head1 = lerp3(axle, top, 0.7)
  const head2 = lerp3(axle, top, 0.96)
  rod(g, head1, head2, 0.04, frameMat)
  for (const s of SIDES) {
    bent(g, [head2, [s * 0.1, 0.94, 0.1], [s * 0.1, 0.92, -0.05], [s * 0.09, 0.86, -0.55]], 0.022, frameMat, 10)
    bent(g, [[s * 0.1, 0.92, -0.05], [s * 0.1, 0.5, -0.1], [s * 0.08, 0.28, 0.0], [s * 0.07, 0.28, 0.32], [0, 0.5, 0.48]], 0.022, frameMat, 10)
    rod(g, [s * 0.1, 0.62, -0.1], [s * 0.09, 0.86, -0.5], 0.016, frameMat, 8)
  }
  rod(g, [0, 0.5, 0.48], head1, 0.026, frameMat, 10)
  // single-cylinder engine
  const eng = metal('#3a3d44', 0.4)
  add(g, rbox(0.24, 0.24, 0.4, 0.05), eng, 0, 0.42, 0.12)
  add(g, cylX(0.11, 0.03, 22), metal('#9aa0a8', 0.3), -0.135, 0.42, 0.16)
  add(g, cylX(0.09, 0.03, 22), metal('#9aa0a8', 0.3), 0.135, 0.42, 0.08)
  const cylinder = add(g, finGeo(0.08, 0.24), metal('#2f3238', 0.45), 0, 0.66, 0.22)
  cylinder.rotation.x = 0.3
  add(g, rbox(0.18, 0.1, 0.18, 0.03), metal('#9aa0a8', 0.3), 0, 0.82, 0.27, 0.3)
  // radiators + shrouds
  for (const s of SIDES) add(g, rbox(0.05, 0.26, 0.24, 0.015), metal('#2b2d33', 0.5), s * 0.11, 0.8, 0.32)
  const shroud = [[0.5, 1.02], [0.18, 1.06], [0.06, 0.92], [0.14, 0.66], [0.36, 0.7], [0.52, 0.88]]
  for (const s of SIDES) add(g, slab('dirtShroud', shroud, 0.04, 0.012), body, s * 0.155)
  // tank, flat seat, side panels, rear fender
  add(g, rbox(0.26, 0.14, 0.3, 0.05), body, 0, 0.94, 0.3)
  add(g, rbox(0.25, 0.08, 0.84, 0.035), LEATHER(), 0, 0.86, -0.26)
  add(g, rbox(0.255, 0.02, 0.84, 0.008), paint(def.body), 0, 0.82, -0.26)
  const side = [[0.0, 0.84], [-0.55, 0.84], [-0.4, 0.58], [-0.08, 0.58]]
  add(g, slab('dirtSide', side, 0.24, 0.02), paint('#f4f4f4'))
  for (const s of SIDES) {
    const d = add(g, cached(geos, 'sidePlate', () => new PlaneGeometry(0.24, 0.18)), decalMat(nTex), s * 0.122, 0.71, -0.26, 0, s * Math.PI / 2)
  }
  add(g, slab('dirtRear', [[-0.45, 0.86], [-1.06, 0.98], [-1.1, 1.02], [-1.0, 1.04], [-0.45, 0.93]], 0.18, 0.015), body)
  add(g, rbox(0.07, 0.03, 0.04, 0.01), TAIL(), 0, 0.975, -1.07, 0.2)
  // swingarm, mono shock, chain, exhaust
  const arm = metal('#b5bbc3', 0.3)
  for (const s of SIDES) beam(g, [s * 0.11, 0.5, -0.08], [s * 0.11, rr, zr], 0.03, 0.07, arm)
  add(g, cylX(0.024, 0.3, 12), CHROME(), 0, rr, zr)
  add(g, cylX(0.026, 0.3, 12), CHROME(), 0, 0.5, -0.08)
  shock(g, [0, 0.5, -0.26], [0, 0.84, -0.12], '#ffcc1a')
  chain(g, -0.115, [-0.02, 0.44], 0.045, [zr, rr], 0.11)
  bent(g, [[0.04, 0.8, 0.36], [0.12, 0.72, 0.42], [0.16, 0.55, 0.3], [0.17, 0.6, 0.0], [0.17, 0.74, -0.25]], 0.026, metal('#9aa0a8', 0.25))
  rod(g, [0.17, 0.76, -0.25], [0.18, 0.92, -0.72], 0.055, metal('#c3c8cf', 0.25), 16)
  add(g, cyl(0.045, 0.045, 0.04, 14), PLASTIC(), 0.18, 0.925, -0.74, -1.25)
  // wide bars with pad and hand guards
  const bar = metal('#c3c8cf', 0.25)
  bent(g, [[-0.33, 1.25, 0.44], [-0.18, 1.22, 0.47], [0.18, 1.22, 0.47], [0.33, 1.25, 0.44]], 0.016, bar)
  add(g, rbox(0.22, 0.05, 0.05, 0.02), paint(def.body), 0, 1.255, 0.475)
  add(g, rbox(0.12, 0.05, 0.08, 0.02), metal('#3c4048', 0.3), 0, 1.2, 0.5)
  grips(g, [[0.33, 1.25, 0.44], [0.43, 1.255, 0.425]])
  for (const s of SIDES) add(g, rbox(0.14, 0.07, 0.04, 0.02), body, s * 0.39, 1.26, 0.5, 0, s * 0.3)
  footpegs(g, 0.45, -0.06, 0.15)

  return { front, rear, rf, rr, seat: { y: 0.9, z: -0.2 }, bars: { y: 1.25, z: 0.44 }, pegs: { y: 0.45, z: -0.06 } }
}

function buildScooter(g, def) {
  const body = paint(def.body)
  const acc = paint(def.accent)
  const rf = 0.25, rr = 0.25, zf = 0.78, zr = -0.68
  const fw = wheel({ r: rf, tube: 0.075, w: 1.1, rim: def.rim, style: 'disc' })
  const rw = wheel({ r: rr, tube: 0.075, w: 1.1, rim: def.rim, style: 'disc' })
  const front = mount(g, fw, zf, rf)
  const rear = mount(g, rw, zr, rr)

  // stubby fork + steering column
  for (const s of SIDES) rod(g, [s * 0.1, rf, zf], [s * 0.1, 0.6, 0.64], 0.026, metal('#3c4048', 0.35), 10)
  add(g, cylX(0.02, 0.24, 10), CHROME(), 0, rf, zf)
  add(g, rbox(0.26, 0.06, 0.1, 0.02), body, 0, 0.62, 0.63)
  rod(g, [0, 0.6, 0.63], [0, 1.02, 0.57], 0.04, body, 14)
  // front fender with a chrome crest
  add(g, shell(rf + 0.035, 0.19, 0.3, 2.0), sheet(def.body), 0, rf, zf)
  for (const s of SIDES) {
    const e = add(g, torusX(rf + 0.035, 0.012, 6, 28, 2.0), sheet(def.body), s * 0.095, rf, zf)
    e.rotation.x = -0.3
  }
  const crest = add(g, torusX(rf + 0.045, 0.012, 6, 20, 1.0), CHROME(), 0, rf, zf)
  crest.rotation.x = -0.5
  // leg shield
  add(g, slab('scootShield', [[0.28, 0.3], [0.42, 0.3], [0.56, 0.48, 0.58, 0.98], [0.5, 1.0], [0.46, 0.52, 0.28, 0.38]], 0.46, 0.06), body)
  add(g, rbox(0.11, 0.06, 0.03, 0.012), CHROME(), 0, 0.66, 0.61, -0.3)
  for (const s of SIDES) {
    // white piping down the shield edges
    add(g, rbox(0.03, 0.56, 0.05, 0.012), acc, s * 0.235, 0.66, 0.49, 0.3)
  }
  // headset with round light, bars, mirrors
  add(g, rbox(0.22, 0.14, 0.18, 0.05), body, 0, 1.06, 0.6)
  add(g, rbox(0.46, 0.07, 0.13, 0.03), body, 0, 1.08, 0.57)
  add(g, cylZ(0.08, 0.08, 24), body, 0, 1.07, 0.69)
  add(g, cylZ(0.068, 0.02, 24), HEAD(), 0, 1.07, 0.735)
  add(g, torusZ(0.072, 0.012, 8, 28), CHROME(), 0, 1.07, 0.735)
  grips(g, [[0.23, 1.08, 0.57], [0.34, 1.08, 0.57]])
  mirrors(g, [0.17, 1.12, 0.57], [0.27, 1.3, 0.55], true)
  // floorboard with rubber strips, centre tunnel
  add(g, rbox(0.4, 0.08, 0.5, 0.025), body, 0, 0.28, 0.06)
  for (const x of [-0.12, -0.04, 0.04, 0.12]) add(g, box(0.03, 0.012, 0.44), RUBBER(), x, 0.326, 0.06)
  add(g, rbox(0.26, 0.42, 0.26, 0.06), body, 0, 0.55, -0.1)
  // rounded rear body + cheeks
  add(g, sphere(1, 28, 18), body, 0, 0.6, -0.5).scale.set(0.24, 0.22, 0.46)
  for (const s of SIDES) add(g, sphere(1, 24, 16), body, s * 0.16, 0.56, -0.56).scale.set(0.12, 0.16, 0.32)
  for (const s of SIDES) add(g, sphere(1, 18, 12), acc, s * 0.277, 0.58, -0.56).scale.set(0.012, 0.06, 0.16)
  // seat with piping
  add(g, rbox(0.3, 0.1, 0.62, 0.045), LEATHER('#3b2a22'), 0, 0.83, -0.42)
  add(g, rbox(0.31, 0.02, 0.63, 0.008), acc, 0, 0.79, -0.42)
  // rear rack + tail light + plate
  const chrome = CHROME()
  for (const s of SIDES) bent(g, [[s * 0.11, 0.8, -0.72], [s * 0.11, 0.88, -0.76], [s * 0.11, 0.88, -0.98], [s * 0.08, 0.8, -1.0]], 0.011, chrome, 8)
  for (const z of [-0.82, -0.9, -0.98]) rod(g, [-0.11, 0.88, z], [0.11, 0.88, z], 0.009, chrome, 6)
  add(g, rbox(0.13, 0.06, 0.05, 0.015), TAIL(), 0, 0.66, -0.965)
  add(g, rbox(0.15, 0.03, 0.06, 0.01), chrome, 0, 0.7, -0.96)
  add(g, rbox(0.16, 0.1, 0.012, 0.004), paint('#eceff2'), 0, 0.5, -0.99, 0.2)
  // muffler on the right
  rod(g, [0.12, 0.3, -0.3], [0.18, 0.27, -0.42], 0.022, chrome, 10)
  rod(g, [0.18, 0.27, -0.42], [0.2, 0.3, -0.84], 0.05, metal('#2f3238', 0.4), 16)
  add(g, cylZ(0.03, 0.05, 12), chrome, 0.2, 0.305, -0.87)
  add(g, rbox(0.06, 0.04, 0.12, 0.015), chrome, 0.2, 0.36, -0.62)

  return { front, rear, rf, rr, seat: { y: 0.88, z: -0.32 }, bars: { y: 1.08, z: 0.57 }, pegs: { y: 0.33, z: 0.12 } }
}

function buildCruiser(g, def) {
  const body = paint(def.body)
  const frameMat = paint(def.accent, 0.3, 0.4)
  const rf = 0.37, rr = 0.37, zf = 0.82, zr = -0.7
  const fw = wheel({ r: rf, tube: 0.07, rim: def.rim, style: 'wire', discs: [-0.075] })
  const rw = wheel({ r: rr, tube: 0.095, w: 1.45, rim: def.rim, style: 'wire', discs: [0.1], sprocket: { x: -0.16, r: 0.17 } })
  const front = mount(g, fw, zf, rf)
  const rear = mount(g, rw, zr, rr)
  const chrome = CHROME()

  // chrome fork with body-coloured shrouds
  const axle = [0, rf, zf]
  const top = [0, 1.12, 0.52]
  fork(g, axle, top, 0.11, chrome, chrome, 0.03, 0.03, 0.5)
  for (const s of SIDES) rod(g, lerp3([s * 0.11, rf, zf], [s * 0.11, top[1], top[2]], 0.6), [s * 0.11, top[1], top[2]], 0.05, body, 16)
  clamp(g, top, 0.11, chrome, 0.12)
  clamp(g, lerp3(axle, top, 0.62), 0.11, chrome, 0.12)
  caliper(g, zf, rf, -0.075, fw.discR, 2.3, '#2b2d33')
  caliper(g, zr, rr, 0.1, rw.discR, 3.7, '#2b2d33')
  // deep valanced front fender
  add(g, shell(rf + 0.04, 0.2, 0.25, 2.2), sheet(def.body), 0, rf, zf)
  for (const s of SIDES) add(g, torusX(rf + 0.04, 0.012, 6, 32, 2.2), chrome, s * 0.1, rf, zf, -0.25)
  // big headlight + passing lamps
  roundHeadlight(g, 0, 1.02, 0.66, 0.1)
  for (const s of SIDES) roundHeadlight(g, s * 0.17, 0.9, 0.66, 0.045)
  rod(g, [-0.17, 0.9, 0.62], [0.17, 0.9, 0.62], 0.012, chrome, 8)
  // pull-back bars on risers
  for (const s of SIDES) rod(g, [s * 0.06, 1.12, 0.52], [s * 0.07, 1.2, 0.53], 0.022, chrome, 10)
  bent(g, [[-0.4, 1.21, 0.44], [-0.12, 1.2, 0.53], [0.12, 1.2, 0.53], [0.4, 1.21, 0.44]], 0.017, chrome)
  grips(g, [[0.4, 1.21, 0.44], [0.47, 1.18, 0.33]])
  mirrors(g, [0.24, 1.2, 0.5], [0.3, 1.38, 0.46], true)
  // teardrop tank with chrome console
  add(g, teardropGeo(0.62, 0.2), body, 0, 0.97, 0.2, -0.1).scale.set(1.15, 0.72, 1)
  add(g, rbox(0.06, 0.02, 0.24, 0.008), chrome, 0, 1.105, 0.21, -0.1)
  add(g, cyl(0.03, 0.03, 0.02, 14), chrome, 0, 1.12, 0.36)
  for (const s of SIDES) add(g, sphere(1, 16, 10), metal('#e8c46a', 0.25), s * 0.225, 0.97, 0.26).scale.set(0.006, 0.05, 0.12)
  // frame
  const head = lerp3(axle, top, 0.85)
  rod(g, head, [0, 0.86, -0.18], 0.03, frameMat)
  for (const s of SIDES) {
    bent(g, [head, [s * 0.09, 0.32, 0.36], [s * 0.09, 0.2, 0.05], [s * 0.1, 0.22, -0.24], [s * 0.17, 0.38, -0.68]], 0.024, frameMat, 10)
    rod(g, [s * 0.1, 0.84, -0.2], [s * 0.17, 0.4, -0.68], 0.02, frameMat, 10)
  }
  // V-twin + transmission
  vtwin(g, 0.08, 0.4, paint(def.body, 0.3, 0.3))
  // shotgun exhausts (right)
  bent(g, [[0.08, 0.76, 0.36], [0.18, 0.55, 0.44], [0.2, 0.3, 0.3], [0.21, 0.28, -0.25]], 0.03, chrome)
  bent(g, [[0.08, 0.76, -0.2], [0.18, 0.62, -0.22], [0.21, 0.42, -0.3]], 0.03, chrome)
  rod(g, [0.21, 0.28, -0.25], [0.24, 0.31, -0.98], 0.048, chrome, 18)
  rod(g, [0.21, 0.42, -0.3], [0.24, 0.44, -0.92], 0.044, chrome, 18)
  add(g, cylZ(0.036, 0.03, 14), PLASTIC(), 0.24, 0.312, -0.99, -0.05)
  add(g, cylZ(0.032, 0.03, 14), PLASTIC(), 0.24, 0.442, -0.93, -0.04)
  // belt (left), swingarm, twin shocks
  chain(g, -0.16, [-0.06, 0.4], 0.07, [zr, rr], 0.17)
  for (const s of SIDES) {
    beam(g, [s * 0.18, 0.4, -0.12], [s * 0.18, rr, zr], 0.035, 0.07, frameMat)
    shock(g, [s * 0.2, 0.4, -0.64], [s * 0.18, 0.76, -0.38], '#e8ecf2')
  }
  add(g, cylX(0.024, 0.42, 12), chrome, 0, rr, zr)
  // big rear fender + light + plate
  add(g, shell(rr + 0.045, 0.34, 0.75, 2.35), sheet(def.body), 0, rr, zr)
  for (const s of SIDES) add(g, torusX(rr + 0.045, 0.013, 6, 36, 2.35), chrome, s * 0.17, rr, zr, -0.75)
  add(g, rbox(0.12, 0.05, 0.06, 0.015), TAIL(), 0, 0.68, -1.03, 0.75)
  add(g, rbox(0.16, 0.11, 0.012, 0.004), paint('#eceff2'), 0, 0.55, -1.1, 0.4)
  // saddlebags
  const bag = LEATHER('#2a1d18')
  for (const s of SIDES) {
    add(g, rbox(0.16, 0.26, 0.44, 0.05), bag, s * 0.31, 0.64, -0.72)
    add(g, rbox(0.17, 0.08, 0.45, 0.03), bag, s * 0.31, 0.77, -0.72)
    for (const z of [-0.84, -0.6]) add(g, cyl(0.016, 0.016, 0.01, 10), chrome, s * 0.392, 0.7, z, 0, 0, Math.PI / 2)
  }
  // saddle + pillion + seat base
  add(g, rbox(0.3, 0.12, 0.32, 0.05), body, 0, 0.66, -0.22)
  add(g, rbox(0.38, 0.1, 0.42, 0.045), LEATHER(), 0, 0.75, -0.2)
  add(g, rbox(0.26, 0.08, 0.26, 0.035), LEATHER(), 0, 0.81, -0.5)
  // floorboards
  for (const s of SIDES) {
    add(g, rbox(0.11, 0.03, 0.27, 0.01), RUBBER(), s * 0.25, 0.3, 0.3)
    add(g, rbox(0.12, 0.02, 0.28, 0.008), chrome, s * 0.25, 0.28, 0.3)
    rod(g, [s * 0.1, 0.25, 0.3], [s * 0.2, 0.28, 0.3], 0.015, chrome, 8)
  }

  return { front, rear, rf, rr, seat: { y: 0.8, z: -0.18 }, bars: { y: 1.19, z: 0.36 }, pegs: { y: 0.32, z: 0.3 } }
}

function buildChopper(g, def) {
  const body = paint(def.body)
  const acc = paint(def.accent)
  const rf = 0.34, rr = 0.38, zf = 1.0, zr = -0.62
  const fw = wheel({ r: rf, tube: 0.055, rim: def.rim, style: 'wire', discs: [-0.045] })
  const rw = wheel({ r: rr, tube: 0.13, w: 1.55, rim: def.rim, style: 'disc', sprocket: { x: -0.25, r: 0.17 } })
  const front = mount(g, fw, zf, rf)
  const rear = mount(g, rw, zr, rr)
  const chrome = CHROME()

  // raked springer-ish fork
  const axle = [0, rf, zf]
  const top = [0, 1.16, 0.44]
  fork(g, axle, top, 0.085, chrome, chrome, 0.028, 0.028, 0.5)
  for (const s of SIDES) rod(g, [s * 0.13, rf + 0.05, zf - 0.03], lerp3([s * 0.13, rf, zf], [s * 0.13, top[1], top[2]], 0.72), 0.014, chrome, 8)
  clamp(g, top, 0.085, chrome, 0.12)
  const low = lerp3(axle, top, 0.72)
  clamp(g, low, 0.085, chrome, 0.12)
  caliper(g, zf, rf, -0.045, fw.discR, 2.4, '#2b2d33')
  roundHeadlight(g, 0, low[1] - 0.04, low[2] + 0.1, 0.07)
  // ape hangers
  for (const s of SIDES) bent(g, [[s * 0.07, 1.18, 0.44], [s * 0.16, 1.62, 0.4], [s * 0.3, 1.63, 0.35]], 0.018, chrome)
  rod(g, [-0.11, 1.32, 0.43], [0.11, 1.32, 0.43], 0.014, chrome, 8)
  grips(g, [[0.3, 1.63, 0.35], [0.42, 1.61, 0.31]])
  // stretched frame (painted)
  const head = lerp3(axle, top, 0.9)
  rod(g, lerp3(axle, top, 0.76), lerp3(axle, top, 1.02), 0.045, body)
  rod(g, head, [0, 0.8, -0.3], 0.032, body)
  for (const s of SIDES) {
    bent(g, [lerp3(axle, top, 0.8), [s * 0.08, 0.26, 0.32], [s * 0.08, 0.22, -0.1], [s * 0.22, 0.24, -0.2], [s * 0.23, rr, zr]], 0.026, body, 10)
    rod(g, [s * 0.06, 0.8, -0.3], [s * 0.23, rr + 0.02, zr], 0.022, body, 10)
  }
  add(g, cylX(0.028, 0.52, 12), chrome, 0, rr, zr)
  // peanut tank with accent flash
  add(g, teardropGeo(0.48, 0.15), body, 0, 1.1, 0.2, -0.4).scale.set(1, 0.8, 1)
  add(g, teardropGeo(0.4, 0.152), acc, 0, 1.08, 0.18, -0.4).scale.set(1.01, 0.5, 1)
  add(g, cyl(0.026, 0.026, 0.02, 12), chrome, 0, 1.2, 0.3)
  // engine
  vtwin(g, 0.06, 0.36, acc)
  // upswept drag pipes (right)
  bent(g, [[0.08, 0.72, 0.28], [0.2, 0.55, 0.34], [0.26, 0.36, 0.18], [0.3, 0.36, -0.3], [0.31, 0.56, -0.86]], 0.032, chrome)
  bent(g, [[0.08, 0.72, -0.12], [0.2, 0.6, -0.16], [0.28, 0.48, -0.3], [0.31, 0.66, -0.82]], 0.03, chrome)
  // drive (left)
  chain(g, -0.25, [-0.02, 0.36], 0.06, [zr, rr], 0.17)
  add(g, rbox(0.06, 0.2, 0.34, 0.03), acc, -0.2, 0.36, -0.04)
  // solo seat, bobbed fender, sissy bar
  add(g, rbox(0.3, 0.07, 0.36, 0.03), LEATHER(), 0, 0.79, -0.3)
  add(g, shell(rr + 0.03, 0.44, 1.0, 1.7), sheet(def.body), 0, rr, zr)
  for (const s of SIDES) add(g, torusX(rr + 0.03, 0.012, 6, 30, 1.7), chrome, s * 0.22, rr, zr, -1.0)
  add(g, rbox(0.09, 0.04, 0.05, 0.012), TAIL(), 0, 0.64, -0.96, 1.0)
  for (const s of SIDES) rod(g, [s * 0.24, 0.42, -0.62], [s * 0.12, 1.4, -0.8], 0.016, chrome, 10)
  add(g, torusZ(0.12, 0.016, 8, 20, Math.PI), chrome, 0, 1.4, -0.8)
  add(g, rbox(0.26, 0.2, 0.05, 0.02), LEATHER(), 0, 1.0, -0.72, -0.18)
  // forward pegs
  footpegs(g, 0.34, 0.42, 0.18, chrome)

  return { front, rear, rf, rr, seat: { y: 0.825, z: -0.3 }, bars: { y: 1.62, z: 0.33 }, pegs: { y: 0.34, z: 0.42 } }
}

// Hyper (and flame, which is a hyper with flame wings): sleek one-piece body,
// hubless glowing rims carried by side blades, neon strips.
function buildHyper(g, def, flames = false) {
  const glowC = def.neon ?? def.rim
  const body = flames ? paint(def.body, 0.55, 0.28) : paint(def.body, 0.15, 0.25)
  const acc = paint(def.accent, flames ? 0.4 : 0.15, 0.3)
  const rf = 0.34, rr = 0.34, zf = 0.8, zr = -0.76
  const fw = wheel({ r: rf, tube: 0.09, rim: def.rim, style: 'hubless', glow: glowC })
  const rw = wheel({ r: rr, tube: 0.09, w: 1.3, rim: def.rim, style: 'hubless', glow: glowC })
  const front = mount(g, fw, zf, rf)
  const rear = mount(g, rw, zr, rr)

  const W = 0.4
  const outline = [
    [1.04, 0.8],
    [0.9, 1.0, 0.55, 1.06],
    [0.22, 1.06],
    [0.02, 1.04, -0.1, 0.8],
    [-0.42, 0.78],
    [-0.74, 0.84, -1.08, 1.04],
    [-1.12, 0.98],
    [-0.92, 0.8, -0.7, 0.8],
    [-0.36, 0.64],
    [-0.24, 0.4, -0.02, 0.36],
    [0.24, 0.36],
    [0.34, 0.5],
    [0.46, 0.92, 0.84, 0.9],
  ]
  add(g, slab('hyperBody', outline, W, 0.07), body)
  // accent side pods
  add(g, slab('hyperPod', [[0.3, 0.44], [0.1, 0.74], [-0.3, 0.72], [-0.32, 0.52], [-0.05, 0.42]], W + 0.03, 0.02), acc)
  // seat pad, visor
  add(g, rbox(0.3, 0.05, 0.34, 0.02), flames ? LEATHER('#1a0d06') : acc, 0, 0.87, -0.26)
  add(g, slab('hyperVisor', [[0.78, 1.04], [0.54, 1.24], [0.48, 1.22], [0.62, 1.08]], 0.3, 0.012), glass(flames ? '#3a1a05' : '#1a1030'))
  // lights
  add(g, rbox(0.26, 0.03, 0.03, 0.01), HEAD(), 0, 0.82, 1.1)
  for (const s of SIDES) {
    const brow = add(g, rbox(0.13, 0.016, 0.02, 0.006), glowMat(glowC), s * 0.1, 0.87, 1.06, 0, -s * 0.5, s * 0.25)
  }
  add(g, rbox(0.26, 0.03, 0.03, 0.01), TAIL(), 0, 1.02, -1.18, 0.3)
  // neon side strips + belly glow + reactor roundels
  const strip = cached(geos, 'hyperStrip', () => {
    const c = new CatmullRomCurve3([[0.98, 0.86], [0.72, 0.95], [0.4, 0.86], [0.1, 0.62], [-0.2, 0.62], [-0.5, 0.75], [-0.8, 0.86], [-1.04, 0.98]].map(([z, y]) => new Vector3(0, y, z)))
    return new TubeGeometry(c, 64, 0.014, 6, false)
  })
  for (const s of SIDES) {
    const m = add(g, strip, glowMat(glowC), s * 0.215)
    add(g, torusX(0.1, 0.018, 8, 32), glowMat(glowC), s * 0.222, 0.58, 0.04)
    add(g, cylX(0.08, 0.02, 24), paint('#121218', 0.6, 0.2), s * 0.215, 0.58, 0.04)
    add(g, cylX(0.035, 0.03, 16), glowMat(glowC), s * 0.22, 0.58, 0.04)
  }
  add(g, box(0.18, 0.012, 0.5), glowMat(glowC), 0, 0.29, 0.1)
  // wheel carriers: side blades + a cradle arc inside each hubless rim
  for (const [z, rad, half, top] of [[zf, rf, 0.12, [0.86, 0.64]], [zr, rr, 0.15, [0.72, -0.4]]]) {
    const inner = rad - 0.18
    for (const s of SIDES) {
      beam(g, [s * half, top[0], top[1]], [s * half, rad + inner - 0.05, z], 0.035, 0.1, acc)
      add(g, cylX(0.045, 0.04, 16), acc, s * half, rad + inner - 0.05, z)
      add(g, cyl(0.022, 0.022, 0.04, 10), glowMat(glowC), s * (half + 0.02), rad + inner - 0.05, z, 0, 0, Math.PI / 2)
    }
    add(g, cylX(0.02, half * 2, 10), acc, 0, rad + inner - 0.05, z)
    add(g, torusX(inner - 0.05, 0.02, 8, 24, 1.3), acc, 0, rad, z, -(Math.PI / 2 - 0.65))
  }
  // clip-ons + pegs
  for (const s of SIDES) rod(g, [s * 0.18, 1.08, 0.42], [s * 0.25, 1.06, 0.4], 0.016, metal('#3c4048', 0.3), 8)
  grips(g, [[0.25, 1.06, 0.4], [0.35, 1.045, 0.38]])
  footpegs(g, 0.52, -0.18, 0.24)

  if (flames) addFlames(g, def)
  return { front, rear, rf, rr, seat: { y: 0.895, z: -0.26 }, bars: { y: 1.05, z: 0.39 }, pegs: { y: 0.52, z: -0.18 } }
}

const FLAME_OUT = () => emit('#ff6a00', '#ff3c00', 0.9, 0.35)
const FLAME_IN = () => emit('#ffd23a', '#ffb000', 1.8, 0.3)
function flame(parent, base, dir, len, r) {
  const d = new Vector3(...dir).normalize()
  const outer = add(parent, cached(geos, key('cone', r, len), () => new ConeGeometry(r, len, 6)), FLAME_OUT())
  outer.quaternion.setFromUnitVectors(UP, d)
  outer.position.set(base[0] + (d.x * len) / 2, base[1] + (d.y * len) / 2, base[2] + (d.z * len) / 2)
  const il = len * 0.7
  const inner = add(parent, cached(geos, key('cone', r * 0.6, il), () => new ConeGeometry(r * 0.6, il, 6)), FLAME_IN())
  inner.quaternion.copy(outer.quaternion)
  inner.position.set(base[0] + d.x * (il / 2 + 0.03), base[1] + d.y * (il / 2 + 0.03), base[2] + d.z * (il / 2 + 0.03))
}
function addFlames(g, def) {
  for (const s of SIDES) {
    // swept wings fanning back from the shoulders
    for (let i = 0; i < 6; i++) {
      const e = 0.05 + i * 0.22
      flame(g, [s * 0.21, 0.8 - i * 0.015, 0.42 - i * 0.03], [s * 0.85, Math.sin(e) * 1.1, -Math.cos(e) * 0.9], 0.8 - i * 0.06, 0.08 - i * 0.004)
    }
    // lower licks along the belly
    for (let i = 0; i < 3; i++) flame(g, [s * 0.21, 0.42 + i * 0.03, 0.28 - i * 0.24], [s * 0.5, 0.15, -1], 0.4, 0.05)
    // nose horns
    flame(g, [s * 0.14, 0.95, 0.85], [s * 0.3, 0.6, -0.6], 0.3, 0.04)
  }
  // crest along the tail (kept behind the seat)
  for (const [z, y, l] of [[-0.56, 0.88, 0.3], [-0.7, 0.92, 0.34], [-0.84, 0.97, 0.38], [-0.98, 1.03, 0.42]]) flame(g, [0, y, z], [0, 0.8, -1], l, 0.055)
  // tail burst
  for (const [x, y] of [[0, 1.02], [-0.08, 0.96], [0.08, 0.96]]) flame(g, [x, y, -1.12], [x * 2, 0.25, -1], 0.5, 0.06)
}

const BUILDERS = {
  scooter: buildScooter,
  dirt: buildDirt,
  sport: buildSport,
  cruiser: buildCruiser,
  chopper: buildChopper,
  hyper: (g, d) => buildHyper(g, d, false),
  flame: (g, d) => buildHyper(g, d, true),
}

// def: { style, body, accent, rim, neon? } from BIKES / FEATURED_BIKES.
export function buildBike(def) {
  const g = new Group()
  g.name = 'bike:' + (def.id ?? def.style)
  const build = BUILDERS[def.style] ?? buildSport
  const r = build(g, def)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  const bb = new Box3().setFromObject(g)
  g.userData = {
    wheels: [r.front.children[0], r.rear.children[0]],
    wheelRadius: r.rr,
    wheelRadii: [r.rf, r.rr],
    seat: r.seat,
    bars: r.bars,
    pegs: r.pegs,
    length: bb.max.z - bb.min.z,
    style: def.style,
  }
  return g
}

// Rolls both wheels by `distance` metres (positive = forward).
export function spinWheels(bike, distance) {
  const u = bike.userData
  const [rf, rr] = u.wheelRadii ?? [u.wheelRadius, u.wheelRadius]
  u.wheels[0].rotation.x = (u.wheels[0].rotation.x + distance / rf) % TAU
  u.wheels[1].rotation.x = (u.wheels[1].rotation.x + distance / rr) % TAU
}
