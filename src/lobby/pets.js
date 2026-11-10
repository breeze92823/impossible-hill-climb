// Blocky cute pets (rounded voxels) and the hatchery eggs.
// Pets face +Z with their feet at y = 0. Structure:
//   root -> hop (Group, bunnies hop it, sea creatures float on it) -> body (bobbing Group:
//   torso, head pivot, tail pivot, wings/fins/tentacles) + leg pivots (hip-height Groups
//   that swing about X). def.size scales the root.
// Geometries/materials are cached and shared; never dispose them per pet.
import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../textures.js'

const TAU = Math.PI * 2
const UP = new Vector3(0, 1, 0)

const geos = new Map()
const mats = new Map()
function cached(map, k, make) {
  let v = map.get(k)
  if (v === undefined) {
    v = make()
    map.set(k, v)
  }
  return v
}
const key = (...a) => a.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v))).join('|')

const plastic = (c, roughness = 0.42) =>
  cached(mats, key('pl', c, roughness), () => new MeshStandardMaterial({ color: c, roughness, metalness: 0.02 }))
const EYE = () => cached(mats, 'eye', () => new MeshStandardMaterial({ color: '#0b0b10', roughness: 0.1, metalness: 0.2 }))
const SHINE = () => cached(mats, 'shine', () => new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.2 }))
const BLUSH = () => cached(mats, 'blush', () => new MeshStandardMaterial({ color: '#ff8fb0', roughness: 0.6, transparent: true, opacity: 0.85 }))
const DARK = () => plastic('#1b1b20', 0.35)
const WHITE = () => plastic('#ffffff')
const PINK = () => plastic('#ffa3b8', 0.5)
const HOOF = () => plastic('#3a2a22', 0.5)
const HORN = () => plastic('#f6ead0', 0.35)
const GOLD = () => cached(mats, 'gold', () => new MeshStandardMaterial({ color: '#ffcf3a', roughness: 0.25, metalness: 0.85 }))
// Perceived brightness 0..1 of a '#rrggbb' colour (dark coats get white eye rims).
function lum(hex) {
  const n = parseInt(String(hex).slice(1, 7), 16)
  if (Number.isNaN(n)) return 1
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255
}
// '#rrggbb' blended toward white by k.
function lighten(hex, k) {
  const n = parseInt(String(hex).slice(1, 7), 16)
  if (Number.isNaN(n)) return '#ffffff'
  const ch = (v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255)
}

const rbox = (w, h, d, r = 0.04) =>
  cached(geos, key('rb', w, h, d, r), () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002)))
const pyramid = (r, h) => cached(geos, key('pyr', r, h), () => new ConeGeometry(r, h, 4).rotateY(Math.PI / 4))
const cone = (r, h, seg = 6) => cached(geos, key('cone', r, h, seg), () => new ConeGeometry(r, h, seg))
const cylZ = (r, len, seg = 16) => cached(geos, key('cylZ', r, len, seg), () => new CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2))
// Torus arc; rotY = -PI/2 puts the arc in the YZ plane starting at +Z and curling up over the top.
const torus = (r, tube, arc = TAU, rotY = 0, rs = 6, ts = 14) =>
  cached(geos, key('tor', r, tube, arc, rotY, rs, ts), () => new TorusGeometry(r, tube, rs, ts, arc).rotateY(rotY))

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  if (rx || ry || rz) m.rotation.set(rx, ry, rz)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}
function group(parent, x = 0, y = 0, z = 0) {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}
// Rounded bar from a to b (local coords), w x d cross-section.
function bar(parent, a, b, w, d, mat) {
  const dir = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = dir.length()
  const m = add(parent, rbox(w, 1, d, Math.min(w, d) * 0.3), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  m.scale.y = len
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1))
  return m
}
const SIDES = [-1, 1]

// Two glossy eyes with highlights (+ optional blush) on a face at local z = fz.
function eyes(head, y, fz, spread, size = 0.075, blush = true, whites = false) {
  for (const s of SIDES) {
    if (whites) add(head, rbox(size * 1.7, size * 1.9, 0.016, 0.01), WHITE(), s * spread, y, fz + 0.004)
    add(head, rbox(size, size * 1.25, 0.03, 0.012), EYE(), s * spread, y, fz + 0.008)
    add(head, rbox(size * 0.38, size * 0.38, 0.012, 0.004), SHINE(), s * spread - size * 0.18, y + size * 0.3, fz + 0.026)
    add(head, rbox(size * 0.2, size * 0.2, 0.01, 0.003), SHINE(), s * spread + size * 0.2, y - size * 0.28, fz + 0.026)
    if (blush) add(head, rbox(size * 0.9, size * 0.45, 0.012, 0.005), BLUSH(), s * (spread + size * 0.75), y - size * 1.05, fz + 0.004)
  }
}

// Skeleton shared by the four-legged pets.
// o: { bw, bh, bl, legLen, legW, legX, legZ, head: [w, h, d], neck: [y, z], color, legMat }
function quadruped(o) {
  const root = new Group()
  const hop = group(root)
  const body = group(hop)
  const color = plastic(o.color)
  const bodyY = o.legLen + o.bh / 2
  const torso = add(body, rbox(o.bw, o.bh, o.bl, o.radius ?? 0.06), color, 0, bodyY, 0)
  const neck = group(body, 0, bodyY + o.neck[0], o.neck[1])
  const [hw, hh, hd] = o.head
  const head = group(neck)
  const skull = add(head, rbox(hw, hh, hd, o.hr ?? 0.06), color, 0, hh * 0.28, hd * 0.3)
  const face = hd * 0.3 + hd / 2 // local z of the front face
  const faceY = hh * 0.28
  const tail = group(body, 0, bodyY + o.bh * 0.25, -o.bl / 2 + 0.01)
  const legs = []
  const legMat = o.legMat ?? color
  for (const [x, z] of [[-o.legX, o.legZ], [o.legX, o.legZ], [-o.legX, -o.legZ], [o.legX, -o.legZ]]) {
    const hip = group(hop, x, o.legLen + 0.02, z)
    add(hip, rbox(o.legW, o.legLen + 0.06, o.legW, 0.035), legMat, 0, -(o.legLen + 0.02) / 2 + 0.01, 0)
    legs.push(hip)
  }
  root.userData = { legs, legPhase: [0, Math.PI, Math.PI, 0], tail, head, body, hop, torso, bodyY }
  return { root, body, head, tail, legs, torso, skull, face, faceY, bodyY, color, hw, hh, hd, legLen: o.legLen, legW: o.legW }
}

// Dark hoof caps on every leg of a quadruped.
function hooves(p, mat = HOOF()) {
  for (const leg of p.legs) add(leg, rbox(p.legW + 0.012, 0.07, p.legW + 0.012, 0.02), mat, 0, -(p.legLen + 0.02) + 0.035, 0)
}

// Dog breeds from def: ears 'butterfly' | 'floppy' | 'bat' | 'pointy' (none = the classic
// patched pup), fluffy (rounder fur + top knot), bow (ribbon colour), size (scales the root;
// > 1.15 also gets longer legs).
function dog(def) {
  const ears = def.ears
  const fluffy = !!def.fluffy
  const tall = (def.size ?? 1) > 1.15
  const bl = fluffy ? 0.56 : 0.58
  const p = quadruped({
    bw: fluffy ? 0.48 : 0.44,
    bh: fluffy ? 0.4 : 0.36,
    bl,
    legLen: tall ? 0.3 : fluffy ? 0.18 : 0.24,
    legW: fluffy ? 0.15 : 0.13,
    legX: 0.14,
    legZ: 0.19,
    head: fluffy ? [0.46, 0.42, 0.4] : [0.42, 0.4, 0.38],
    neck: [0.14, 0.26],
    color: def.color,
    radius: fluffy ? 0.14 : 0.06,
    hr: fluffy ? 0.13 : 0.06,
  })
  const col = p.color
  const spot = plastic(def.spot)
  const { head, face, faceY, bodyY, hw } = p
  const dark = lum(def.color) < 0.3
  const marked = ears === 'bat' || ears === 'pointy' // white muzzle + chest blaze
  // muzzle, nose, mouth
  // dark coats get a lighter muzzle so the face still reads
  add(head, rbox(0.22, 0.14, 0.14, 0.04), marked ? spot : dark ? plastic(lighten(def.color, 0.3)) : col, 0, faceY - 0.08, face + 0.06)
  add(head, rbox(0.09, 0.06, 0.04, 0.015), DARK(), 0, faceY - 0.03, face + 0.13)
  add(head, rbox(0.1, 0.02, 0.012, 0.005), DARK(), 0, faceY - 0.13, face + 0.13)
  // markings
  if (!ears || ears === 'butterfly') {
    add(p.body, rbox(0.3, 0.03, 0.26, 0.012), spot, 0.05, bodyY + 0.172, -0.08)
    add(p.body, rbox(0.03, 0.18, 0.22, 0.012), spot, 0.212, bodyY + 0.02, -0.1)
  }
  if (!ears) add(head, rbox(0.16, 0.16, 0.012, 0.03), spot, -0.1, faceY + 0.06, face + 0.002)
  if (ears === 'butterfly') for (const s of SIDES) add(head, rbox(0.15, 0.17, 0.012, 0.03), spot, s * 0.11, faceY + 0.07, face + 0.002)
  if (ears === 'bat') add(head, rbox(0.06, 0.2, 0.012, 0.02), spot, 0, faceY + 0.07, face + 0.002)
  if (ears === 'pointy') {
    add(head, rbox(0.34, 0.12, 0.012, 0.04), spot, 0, faceY - 0.07, face + 0.002)
    for (const s of SIDES) add(head, rbox(0.05, 0.03, 0.012, 0.01), spot, s * 0.1, faceY + 0.15, face + 0.002)
  }
  if (marked) add(p.body, rbox(0.24, 0.22, 0.03, 0.012), spot, 0, bodyY - 0.03, bl / 2 + 0.005)
  eyes(head, faceY + 0.06, face, 0.1, 0.075, true, dark || ears === 'butterfly')
  // ears
  if (ears === 'butterfly') {
    for (const s of SIDES) {
      const e = group(head, s * 0.14, faceY + 0.17, 0.1)
      e.rotation.z = -s * 0.5
      add(e, rbox(0.13, 0.14, 0.05, 0.03), spot, 0, 0.05, 0)
      add(e, rbox(0.25, 0.2, 0.05, 0.06), spot, s * 0.03, 0.18, 0)
      add(e, rbox(0.15, 0.12, 0.012, 0.03), PINK(), s * 0.02, 0.16, 0.03)
      add(e, rbox(0.09, 0.09, 0.05, 0.035), spot, s * 0.15, 0.28, 0)
    }
  } else if (ears === 'floppy') {
    const len = fluffy ? 0.34 : 0.28
    for (const s of SIDES) {
      const e = group(head, s * (hw / 2 + 0.02), faceY + 0.13, 0.12)
      e.rotation.z = s * 0.12
      add(e, rbox(0.08, len, 0.16, 0.04), spot, 0, -len / 2 + 0.04, 0)
      if (fluffy) add(e, rbox(0.11, 0.1, 0.18, 0.05), spot, 0, -len + 0.06, 0)
    }
  } else if (ears === 'bat') {
    for (const s of SIDES) {
      add(head, pyramid(0.1, 0.26), col, s * 0.14, faceY + 0.29, 0.08, 0, 0, -s * 0.22)
      add(head, pyramid(0.055, 0.15), PINK(), s * 0.15, faceY + 0.26, 0.125, 0, 0, -s * 0.22)
    }
  } else if (ears === 'pointy') {
    for (const s of SIDES) {
      add(head, pyramid(0.085, 0.17), col, s * 0.13, faceY + 0.26, 0.1, 0, 0, -s * 0.12)
      add(head, pyramid(0.05, 0.1), spot, s * 0.135, faceY + 0.245, 0.14, 0, 0, -s * 0.12)
    }
  } else {
    add(head, rbox(0.1, 0.24, 0.14, 0.035), spot, 0.24, faceY + 0.02, 0.12, 0, 0, 0.22)
    add(head, rbox(0.1, 0.24, 0.14, 0.035), plastic(def.color === '#ffffff' ? '#f1ece6' : def.color), -0.24, faceY + 0.02, 0.12, 0, 0, -0.22)
  }
  // fluffy coat: fur skirt over the leg tops + a top knot
  if (fluffy) {
    add(p.body, rbox(0.52, 0.12, 0.52, 0.06), col, 0, bodyY - 0.16, 0)
    add(head, rbox(0.2, 0.11, 0.18, 0.05), col, 0, faceY + 0.22, 0.12)
  }
  if (def.bow) {
    const b = plastic(def.bow, 0.35)
    const bx = fluffy ? 0 : 0.1
    const by = faceY + (fluffy ? 0.29 : 0.23)
    for (const s of SIDES) add(head, rbox(0.09, 0.08, 0.04, 0.02), b, bx + s * 0.05, by, 0.14, 0, 0, s * 0.35)
    add(head, rbox(0.045, 0.05, 0.05, 0.015), b, bx, by, 0.14)
  }
  // tails
  if (ears === 'pointy') add(p.tail, torus(0.08, 0.035, TAU * 0.8, Math.PI / 2), col, 0, 0.11, -0.04)
  else if (ears === 'bat') add(p.tail, rbox(0.07, 0.07, 0.1, 0.03), col, 0, 0.02, -0.03, 0.4)
  else if (ears === 'butterfly') add(p.tail, rbox(0.13, 0.13, 0.26, 0.06), spot, 0, 0.1, -0.08, 0.9)
  else if (ears === 'floppy') {
    if (fluffy) add(p.tail, rbox(0.15, 0.15, 0.24, 0.07), col, 0, 0.12, -0.04, 1.0)
    else if (tall) add(p.tail, rbox(0.06, 0.06, 0.32, 0.03), col, 0, -0.04, -0.14, -0.45)
    else add(p.tail, rbox(0.1, 0.1, 0.3, 0.04), col, 0, 0.06, -0.12, 0.45)
  } else add(p.tail, rbox(0.08, 0.08, 0.22, 0.03), spot, 0, 0.08, -0.07, 0.85)
  return p.root
}

function cat(def) {
  const p = quadruped({ bw: 0.38, bh: 0.32, bl: 0.56, legLen: 0.22, legW: 0.11, legX: 0.12, legZ: 0.19, head: [0.42, 0.36, 0.36], neck: [0.12, 0.25], color: def.color })
  const spot = plastic(def.spot)
  const col = plastic(def.color)
  const { head, face, faceY } = p
  for (const s of SIDES) {
    add(head, pyramid(0.1, 0.17), col, s * 0.13, faceY + 0.25, 0.1)
    add(head, pyramid(0.06, 0.11), spot, s * 0.13, faceY + 0.235, 0.145)
  }
  add(head, rbox(0.16, 0.09, 0.07, 0.03), col, 0, faceY - 0.08, face + 0.025)
  add(head, rbox(0.055, 0.035, 0.02, 0.01), spot, 0, faceY - 0.04, face + 0.065)
  for (const s of SIDES) for (const dy of [-0.06, -0.1]) add(head, rbox(0.15, 0.008, 0.008, 0.003), DARK(), s * 0.14, faceY + dy, face + 0.05, 0, 0, s * (dy + 0.08) * 2.2)
  eyes(head, faceY + 0.05, face, 0.1, 0.08)
  add(p.body, rbox(0.24, 0.03, 0.2, 0.012), spot, -0.04, p.bodyY + 0.152, -0.06)
  // long tail that curls up
  add(p.tail, rbox(0.07, 0.07, 0.26, 0.03), col, 0, 0.06, -0.11, 0.55)
  const tip = group(p.tail, 0, 0.13, -0.22)
  add(tip, rbox(0.07, 0.22, 0.07, 0.03), col, 0, 0.1, -0.01)
  add(tip, rbox(0.075, 0.06, 0.075, 0.03), spot, 0, 0.21, -0.01)
  return p.root
}

function bunny(def) {
  const p = quadruped({ bw: 0.42, bh: 0.36, bl: 0.48, legLen: 0.14, legW: 0.14, legX: 0.13, legZ: 0.14, head: [0.42, 0.36, 0.36], neck: [0.12, 0.2], color: def.color, radius: 0.1 })
  const spot = plastic(def.spot)
  const col = plastic(def.color)
  const { head, face, faceY } = p
  for (const s of SIDES) {
    const ear = group(head, s * 0.09, faceY + 0.16, 0.08)
    ear.rotation.z = -s * 0.14
    add(ear, rbox(0.1, 0.36, 0.06, 0.04), col, 0, 0.18, 0)
    add(ear, rbox(0.055, 0.27, 0.012, 0.012), spot, 0, 0.19, 0.03)
  }
  add(head, rbox(0.16, 0.1, 0.05, 0.03), col, 0, faceY - 0.08, face + 0.02)
  add(head, rbox(0.06, 0.04, 0.02, 0.012), spot, 0, faceY - 0.04, face + 0.05)
  add(head, rbox(0.06, 0.05, 0.012, 0.006), plastic('#ffffff'), 0, faceY - 0.15, face + 0.035)
  eyes(head, faceY + 0.05, face, 0.1, 0.08)
  add(p.tail, rbox(0.16, 0.16, 0.14, 0.07), plastic('#ffffff'), 0, 0.02, -0.03)
  // big back feet
  for (const s of SIDES) add(p.legs[s < 0 ? 2 : 3], rbox(0.15, 0.06, 0.22, 0.03), col, 0, -0.13, 0.04)
  return p.root
}

function pig(def) {
  const p = quadruped({ bw: 0.48, bh: 0.4, bl: 0.6, legLen: 0.18, legW: 0.13, legX: 0.15, legZ: 0.2, head: [0.42, 0.38, 0.34], neck: [0.1, 0.28], color: def.color, radius: 0.08 })
  const spot = plastic(def.spot)
  const { head, face, faceY } = p
  add(head, cylZ(0.095, 0.08, 18), spot, 0, faceY - 0.06, face + 0.03)
  for (const s of SIDES) add(head, rbox(0.03, 0.045, 0.02, 0.01), DARK(), s * 0.035, faceY - 0.06, face + 0.07)
  eyes(head, faceY + 0.08, face, 0.11, 0.07)
  for (const s of SIDES) add(head, rbox(0.14, 0.14, 0.04, 0.02), spot, s * 0.15, faceY + 0.23, 0.13, 0.6, 0, s * 0.3)
  add(p.body, rbox(0.2, 0.03, 0.18, 0.012), spot, 0.1, p.bodyY + 0.202, -0.1)
  add(p.tail, cached(geos, 'curl', () => new TorusGeometry(0.05, 0.016, 6, 14, Math.PI * 1.6)), spot, 0, 0.02, -0.03, 0, Math.PI / 2, 0)
  return p.root
}

function fox(def) {
  const dark = plastic('#2a1a14')
  const p = quadruped({ bw: 0.38, bh: 0.32, bl: 0.58, legLen: 0.24, legW: 0.11, legX: 0.12, legZ: 0.2, head: [0.42, 0.34, 0.34], neck: [0.12, 0.27], color: def.color })
  const spot = plastic(def.spot)
  const col = plastic(def.color)
  const { head, face, faceY } = p
  for (const leg of p.legs) add(leg, rbox(0.12, 0.11, 0.12, 0.03), dark, 0, -0.2, 0)
  add(p.body, rbox(0.28, 0.2, 0.03, 0.012), spot, 0, p.bodyY - 0.03, 0.29)
  add(p.body, rbox(0.26, 0.03, 0.4, 0.012), spot, 0, p.bodyY - 0.152, 0.02)
  add(head, rbox(0.44, 0.13, 0.3, 0.04), spot, 0, faceY - 0.12, 0.15)
  add(head, rbox(0.18, 0.12, 0.17, 0.04), spot, 0, faceY - 0.08, face + 0.08)
  add(head, rbox(0.07, 0.05, 0.04, 0.015), DARK(), 0, faceY - 0.04, face + 0.16)
  eyes(head, faceY + 0.05, face, 0.1, 0.075, false)
  for (const s of SIDES) {
    add(head, pyramid(0.1, 0.2), col, s * 0.13, faceY + 0.26, 0.1)
    add(head, pyramid(0.045, 0.08), dark, s * 0.13, faceY + 0.34, 0.1)
  }
  // bushy tail with a white tip
  add(p.tail, rbox(0.17, 0.17, 0.34, 0.07), col, 0, 0.1, -0.13, 0.5)
  add(p.tail, rbox(0.18, 0.18, 0.13, 0.07), spot, 0, 0.21, -0.33, 0.5)
  return p.root
}

function panda(def) {
  const black = plastic(def.spot, 0.4)
  const p = quadruped({ bw: 0.5, bh: 0.42, bl: 0.58, legLen: 0.2, legW: 0.15, legX: 0.16, legZ: 0.19, head: [0.46, 0.4, 0.38], neck: [0.13, 0.27], color: def.color, legMat: black, radius: 0.09 })
  const { head, face, faceY } = p
  add(p.body, rbox(0.52, 0.24, 0.2, 0.08), black, 0, p.bodyY + 0.03, 0.14)
  for (const s of SIDES) {
    add(head, rbox(0.13, 0.13, 0.07, 0.04), black, s * 0.18, faceY + 0.21, 0.1)
    add(head, rbox(0.14, 0.17, 0.014, 0.05), black, s * 0.1, faceY + 0.04, face + 0.003, 0, 0, s * 0.35)
  }
  eyes(head, faceY + 0.05, face + 0.01, 0.1, 0.06)
  add(head, rbox(0.2, 0.12, 0.08, 0.04), plastic(def.color), 0, faceY - 0.09, face + 0.03)
  add(head, rbox(0.08, 0.05, 0.03, 0.015), black, 0, faceY - 0.05, face + 0.075)
  add(p.tail, rbox(0.1, 0.1, 0.07, 0.04), black, 0, 0, -0.02)
  return p.root
}

function crab(def) {
  const root = new Group()
  const hop = group(root)
  const body = group(hop)
  const red = plastic(def.color, 0.35)
  const spot = plastic(def.spot, 0.35)
  const bodyY = 0.4
  const torso = add(body, rbox(0.7, 0.3, 0.52, 0.1), red, 0, bodyY, 0)
  add(body, rbox(0.56, 0.06, 0.4, 0.03), red, 0, bodyY + 0.16, -0.02)
  for (const [x, z, s] of [[-0.18, 0.04, 0.1], [0.14, -0.1, 0.12], [0.02, 0.12, 0.07], [0.22, 0.1, 0.06]]) add(body, rbox(s, 0.02, s, 0.008), spot, x, bodyY + 0.195, z)
  add(body, rbox(0.12, 0.02, 0.012, 0.005), DARK(), 0, bodyY - 0.04, 0.262)
  // eye stalks = head
  const head = group(body, 0, bodyY + 0.12, 0.18)
  for (const s of SIDES) {
    bar(head, [s * 0.1, 0, 0], [s * 0.12, 0.2, 0.02], 0.035, 0.035, red)
    add(head, rbox(0.1, 0.1, 0.1, 0.035), plastic('#ffffff'), s * 0.12, 0.25, 0.02)
    add(head, rbox(0.06, 0.07, 0.03, 0.012), EYE(), s * 0.12, 0.25, 0.07)
    add(head, rbox(0.022, 0.022, 0.01, 0.004), SHINE(), s * 0.12 - 0.012, 0.268, 0.087)
  }
  // claws
  const claws = []
  for (const s of SIDES) {
    bar(body, [s * 0.24, bodyY, 0.22], [s * 0.36, bodyY + 0.06, 0.42], 0.07, 0.07, red)
    const claw = group(body, s * 0.38, bodyY + 0.08, 0.48)
    add(claw, rbox(0.2, 0.15, 0.2, 0.06), red, 0, 0, 0)
    add(claw, rbox(0.16, 0.06, 0.16, 0.025), spot, 0, -0.05, 0.14)
    const jaw = group(claw, 0, 0.04, 0.08)
    add(jaw, rbox(0.15, 0.06, 0.17, 0.025), spot, 0, 0.02, 0.08)
    claws.push(jaw)
  }
  // six jointed legs
  const legs = []
  for (const z of [0.12, -0.02, -0.16]) {
    for (const s of SIDES) {
      const hip = group(hop, s * 0.3, 0.36, z)
      bar(hip, [0, 0, 0], [s * 0.2, 0.1, 0], 0.06, 0.06, red)
      bar(hip, [s * 0.2, 0.1, 0], [s * 0.28, -0.34, 0], 0.055, 0.055, red)
      add(hip, rbox(0.05, 0.04, 0.05, 0.015), spot, s * 0.285, -0.34, 0)
      legs.push(hip)
    }
  }
  const tail = group(body, 0, bodyY, -0.26)
  root.userData = { legs, legPhase: legs.map((_, i) => ((i + (i >> 1)) % 2) * Math.PI), tail, head, body, hop, torso, bodyY, claws }
  return root
}

function dragon(def) {
  const p = quadruped({ bw: 0.44, bh: 0.38, bl: 0.58, legLen: 0.22, legW: 0.13, legX: 0.14, legZ: 0.19, head: [0.4, 0.36, 0.38], neck: [0.15, 0.27], color: def.color })
  const spot = plastic(def.spot, 0.3)
  const col = plastic(def.color)
  const horn = plastic('#fff1c4', 0.3)
  const { head, face, faceY } = p
  add(p.body, rbox(0.3, 0.03, 0.46, 0.012), spot, 0, p.bodyY - 0.192, 0.02)
  add(p.body, rbox(0.26, 0.22, 0.03, 0.012), spot, 0, p.bodyY - 0.02, 0.29)
  for (let i = 0; i < 3; i++) add(p.body, cone(0.05, 0.12, 4), spot, 0, p.bodyY + 0.23, 0.14 - i * 0.16, -0.3)
  // snout, nostrils, horns, eyes
  add(head, rbox(0.28, 0.17, 0.2, 0.05), col, 0, faceY - 0.07, face + 0.07)
  for (const s of SIDES) add(head, rbox(0.03, 0.03, 0.02, 0.008), DARK(), s * 0.06, faceY - 0.02, face + 0.17)
  add(head, rbox(0.2, 0.03, 0.04, 0.01), spot, 0, faceY - 0.15, face + 0.05)
  for (const s of SIDES) {
    add(head, cone(0.045, 0.22, 6), horn, s * 0.12, faceY + 0.26, 0.02, -0.55, 0, -s * 0.15)
    add(head, rbox(0.06, 0.08, 0.05, 0.02), spot, s * 0.22, faceY + 0.02, 0.1)
  }
  eyes(head, faceY + 0.06, face, 0.1, 0.08)
  // wings: pivots at the shoulders, flap about Z
  const wings = []
  for (const s of SIDES) {
    const w = group(p.body, s * 0.2, p.bodyY + 0.16, 0.06)
    w.userData.side = s
    bar(w, [0, 0, 0], [s * 0.4, 0.1, -0.04], 0.05, 0.05, col)
    add(w, rbox(0.36, 0.025, 0.26, 0.012), spot, s * 0.22, 0.04, -0.14, 0, 0, s * 0.25)
    add(w, rbox(0.2, 0.025, 0.14, 0.012), spot, s * 0.36, 0.08, -0.3, 0, 0, s * 0.25)
    add(w, cone(0.03, 0.1, 4), horn, s * 0.42, 0.13, -0.04, 0, 0, -s * 1.2)
    wings.push(w)
  }
  // tapered tail with a spade tip (two pivots so it sways)
  add(p.tail, rbox(0.15, 0.15, 0.26, 0.05), col, 0, -0.02, -0.11, 0.2)
  const t2 = group(p.tail, 0, -0.06, -0.23)
  add(t2, rbox(0.1, 0.1, 0.24, 0.04), col, 0, 0, -0.1, -0.1)
  add(t2, cone(0.04, 0.09, 4), spot, 0, 0.07, -0.08, -0.3)
  const tip = add(t2, pyramid(0.1, 0.16), spot, 0, 0.02, -0.27, -Math.PI / 2)
  tip.scale.set(1, 1, 0.35)
  p.root.userData.wings = wings
  p.root.userData.tail2 = t2
  return p.root
}

// --- Farm ---------------------------------------------------------------------
function chicken(def) {
  const root = new Group()
  const hop = group(root)
  const body = group(hop)
  const col = plastic(def.color)
  const red = plastic(def.spot, 0.35)
  const yellow = plastic('#ffb020', 0.4)
  const legLen = 0.2
  const bodyY = legLen + 0.16
  const torso = add(body, rbox(0.36, 0.32, 0.42, 0.12), col, 0, bodyY, 0)
  // head (pivot at the neck so it can bob and peck)
  const head = group(body, 0, bodyY + 0.12, 0.14)
  add(head, rbox(0.26, 0.28, 0.24, 0.08), col, 0, 0.14, 0.02)
  const fz = 0.14
  add(head, cone(0.055, 0.12, 4), yellow, 0, 0.12, fz + 0.05, Math.PI / 2)
  add(head, rbox(0.05, 0.08, 0.04, 0.02), red, 0, 0.03, fz + 0.02)
  for (const [z, h] of [[0.1, 0.1], [0.03, 0.13], [-0.04, 0.1]]) add(head, rbox(0.05, h, 0.07, 0.02), red, 0, 0.27 + h / 2, z)
  eyes(head, 0.18, fz, 0.075, 0.06)
  // wings flap about Z at the shoulders
  const wings = []
  for (const s of SIDES) {
    const w = group(body, s * 0.18, bodyY + 0.09, 0.02)
    w.userData.side = s
    add(w, rbox(0.06, 0.2, 0.28, 0.04), col, s * 0.015, -0.07, -0.02)
    wings.push(w)
  }
  const tail = group(body, 0, bodyY + 0.08, -0.2)
  add(tail, rbox(0.2, 0.24, 0.08, 0.04), col, 0, 0.1, -0.02, -0.4)
  const legs = []
  for (const s of SIDES) {
    const hip = group(hop, s * 0.08, legLen + 0.02, 0)
    add(hip, rbox(0.045, legLen + 0.04, 0.045, 0.015), yellow, 0, -(legLen + 0.02) / 2, 0)
    add(hip, rbox(0.12, 0.03, 0.14, 0.012), yellow, 0, -(legLen + 0.02) + 0.015, 0.04)
    legs.push(hip)
  }
  root.userData = { legs, legPhase: [0, Math.PI], tail, head, headZ: head.position.z, body, hop, torso, bodyY, wings }
  return root
}

function cow(def) {
  const p = quadruped({ bw: 0.48, bh: 0.4, bl: 0.66, legLen: 0.22, legW: 0.14, legX: 0.15, legZ: 0.22, head: [0.4, 0.36, 0.32], neck: [0.12, 0.32], color: def.color, radius: 0.08 })
  const spot = plastic(def.spot)
  const col = p.color
  const { head, face, faceY, bodyY } = p
  // black patches (thin plates on the back, sides and rump)
  add(p.body, rbox(0.24, 0.03, 0.22, 0.012), spot, -0.03, bodyY + 0.2, 0.06)
  add(p.body, rbox(0.03, 0.2, 0.24, 0.012), spot, 0.24, bodyY + 0.02, -0.12)
  add(p.body, rbox(0.03, 0.16, 0.18, 0.012), spot, -0.24, bodyY - 0.04, 0.12)
  add(p.body, rbox(0.2, 0.16, 0.03, 0.012), spot, 0.06, bodyY + 0.06, -0.33)
  add(head, rbox(0.16, 0.15, 0.012, 0.03), spot, 0.1, faceY + 0.08, face + 0.002)
  // pink snout + nostrils
  add(head, rbox(0.32, 0.15, 0.1, 0.05), PINK(), 0, faceY - 0.1, face + 0.04)
  for (const s of SIDES) add(head, rbox(0.035, 0.035, 0.012, 0.01), DARK(), s * 0.07, faceY - 0.08, face + 0.092)
  eyes(head, faceY + 0.06, face, 0.1, 0.07, false)
  for (const s of SIDES) {
    add(head, cone(0.035, 0.12, 6), HORN(), s * 0.13, faceY + 0.22, 0.06, 0, 0, -s * 0.35)
    add(head, rbox(0.14, 0.06, 0.08, 0.025), col, s * 0.25, faceY + 0.12, 0.08, 0, 0, -s * 0.25)
  }
  hooves(p)
  add(p.body, rbox(0.14, 0.07, 0.12, 0.03), PINK(), 0, bodyY - 0.21, -0.12)
  bar(p.tail, [0, 0, 0], [0, -0.24, -0.05], 0.035, 0.035, col)
  add(p.tail, rbox(0.07, 0.09, 0.07, 0.025), spot, 0, -0.27, -0.055)
  p.root.userData.tailZ = true
  return p.root
}

function goat(def) {
  const p = quadruped({ bw: 0.38, bh: 0.32, bl: 0.54, legLen: 0.26, legW: 0.11, legX: 0.12, legZ: 0.19, head: [0.34, 0.32, 0.32], neck: [0.16, 0.25], color: def.color })
  const spot = plastic(def.spot, 0.4)
  const col = p.color
  const { head, face, faceY, bodyY } = p
  add(head, rbox(0.2, 0.13, 0.12, 0.04), col, 0, faceY - 0.08, face + 0.05)
  add(head, rbox(0.07, 0.035, 0.02, 0.01), DARK(), 0, faceY - 0.04, face + 0.11)
  add(head, rbox(0.08, 0.018, 0.012, 0.005), DARK(), 0, faceY - 0.12, face + 0.11)
  add(head, cone(0.045, 0.14, 4), spot, 0, faceY - 0.2, face + 0.06, Math.PI) // beard
  eyes(head, faceY + 0.05, face, 0.09, 0.07)
  for (const s of SIDES) {
    add(head, torus(0.1, 0.03, Math.PI * 0.95, -Math.PI / 2, 6, 10), spot, s * 0.08, faceY + 0.15, 0.04, 0, 0, -s * 0.2) // curved horns
    add(head, rbox(0.14, 0.05, 0.08, 0.025), col, s * 0.22, faceY + 0.08, 0.1, 0, 0, -s * 0.35)
  }
  add(p.body, rbox(0.22, 0.03, 0.22, 0.012), spot, 0.02, bodyY + 0.152, -0.06)
  hooves(p)
  add(p.tail, rbox(0.06, 0.12, 0.05, 0.025), col, 0, 0.06, -0.02, -0.4)
  return p.root
}

function horse(def) {
  const p = quadruped({ bw: 0.38, bh: 0.36, bl: 0.72, legLen: 0.4, legW: 0.11, legX: 0.12, legZ: 0.26, head: [0.26, 0.28, 0.3], neck: [0.34, 0.34], color: def.color })
  const mane = plastic(def.spot, 0.5)
  const col = p.color
  const { head, face, faceY, bodyY } = p
  bar(p.body, [0, bodyY + 0.06, 0.26], [0, bodyY + 0.36, 0.36], 0.2, 0.2, col) // neck
  bar(p.body, [0, bodyY + 0.12, 0.17], [0, bodyY + 0.46, 0.28], 0.07, 0.1, mane)
  add(head, rbox(0.22, 0.17, 0.2, 0.05), plastic('#c8956b'), 0, faceY - 0.1, face + 0.06)
  for (const s of SIDES) add(head, rbox(0.03, 0.04, 0.012, 0.01), DARK(), s * 0.05, faceY - 0.08, face + 0.162)
  add(head, rbox(0.06, 0.18, 0.012, 0.02), WHITE(), 0, faceY + 0.05, face + 0.002)
  eyes(head, faceY + 0.07, face, 0.08, 0.065, false)
  for (const s of SIDES) add(head, pyramid(0.05, 0.13), col, s * 0.08, faceY + 0.2, 0.02, 0, 0, -s * 0.15)
  add(head, rbox(0.1, 0.08, 0.08, 0.03), mane, 0, faceY + 0.15, 0.2)
  hooves(p)
  bar(p.tail, [0, 0, 0], [0, -0.34, -0.1], 0.1, 0.12, mane)
  p.root.userData.tailZ = true
  return p.root
}

function bull(def) {
  const p = quadruped({ bw: 0.54, bh: 0.44, bl: 0.66, legLen: 0.22, legW: 0.16, legX: 0.16, legZ: 0.21, head: [0.46, 0.38, 0.34], neck: [0.12, 0.33], color: def.color, radius: 0.09 })
  const spot = plastic(def.spot, 0.4)
  const col = p.color
  const { head, face, faceY, bodyY } = p
  add(p.body, rbox(0.46, 0.14, 0.24, 0.07), col, 0, bodyY + 0.22, 0.14) // shoulder hump
  add(head, rbox(0.16, 0.08, 0.12, 0.04), spot, 0, faceY + 0.2, 0.12) // forelock tuft
  add(head, rbox(0.32, 0.16, 0.1, 0.05), plastic('#c48a6a'), 0, faceY - 0.1, face + 0.04)
  for (const s of SIDES) add(head, rbox(0.035, 0.035, 0.012, 0.01), DARK(), s * 0.07, faceY - 0.08, face + 0.092)
  add(head, torus(0.045, 0.012, TAU, 0, 6, 16), GOLD(), 0, faceY - 0.14, face + 0.095) // nose ring
  for (const s of SIDES) {
    bar(head, [s * 0.2, faceY + 0.14, 0.1], [s * 0.38, faceY + 0.2, 0.1], 0.09, 0.09, HORN())
    add(head, cone(0.045, 0.16, 6), HORN(), s * 0.42, faceY + 0.3, 0.1, 0, 0, -s * 0.3)
    add(head, rbox(0.12, 0.03, 0.02, 0.01), spot, s * 0.1, faceY + 0.14, face + 0.01, 0, 0, s * 0.3) // brows
    add(head, rbox(0.12, 0.06, 0.08, 0.025), col, s * 0.27, faceY + 0.06, 0.08, 0, 0, -s * 0.25)
  }
  eyes(head, faceY + 0.05, face, 0.11, 0.07, false, true)
  hooves(p, DARK())
  bar(p.tail, [0, 0, 0], [0, -0.26, -0.05], 0.04, 0.04, col)
  add(p.tail, rbox(0.08, 0.1, 0.08, 0.03), spot, 0, -0.29, -0.055)
  p.root.userData.tailZ = true
  return p.root
}

function llama(def) {
  const p = quadruped({ bw: 0.4, bh: 0.36, bl: 0.54, legLen: 0.32, legW: 0.12, legX: 0.12, legZ: 0.18, head: [0.26, 0.26, 0.26], neck: [0.5, 0.24], color: def.color, radius: 0.12, hr: 0.08 })
  const fluff = plastic(def.spot, 0.6)
  const col = p.color
  const { head, face, faceY, bodyY } = p
  add(p.body, rbox(0.2, 0.5, 0.2, 0.08), col, 0, bodyY + 0.24, 0.22) // long neck
  add(p.body, rbox(0.24, 0.24, 0.1, 0.08), fluff, 0, bodyY + 0.06, 0.29) // fluffy bib
  add(p.body, rbox(0.44, 0.2, 0.24, 0.05), plastic('#e8264e', 0.6), 0, bodyY + 0.09, -0.02) // blanket
  add(p.body, rbox(0.45, 0.035, 0.25, 0.015), plastic('#ffc21f', 0.5), 0, bodyY - 0.01, -0.02)
  add(head, rbox(0.16, 0.12, 0.12, 0.04), col, 0, faceY - 0.06, face + 0.05)
  add(head, rbox(0.06, 0.03, 0.02, 0.01), DARK(), 0, faceY - 0.03, face + 0.11)
  add(head, rbox(0.012, 0.04, 0.012, 0.004), DARK(), 0, faceY - 0.08, face + 0.11)
  eyes(head, faceY + 0.04, face, 0.07, 0.06)
  for (const s of SIDES) add(head, rbox(0.06, 0.18, 0.05, 0.025), col, s * 0.08, faceY + 0.2, 0, 0, 0, -s * 0.2)
  add(head, rbox(0.2, 0.08, 0.14, 0.04), fluff, 0, faceY + 0.14, 0.12) // fringe
  for (const leg of p.legs) add(leg, rbox(0.16, 0.14, 0.16, 0.07), fluff, 0, -0.08, 0)
  add(p.tail, rbox(0.1, 0.14, 0.08, 0.05), fluff, 0, 0.04, -0.03, -0.3)
  return p.root
}

// --- Sea creatures: float above the ground on the hop group ------------------------
function swimmer(float) {
  const root = new Group()
  const hop = group(root, 0, float, 0)
  const body = group(hop)
  return { root, hop, body }
}

function seahorse(def) {
  const float = 0.42
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const spot = plastic(def.spot)
  const torso = add(body, rbox(0.26, 0.36, 0.26, 0.1), col, 0, 0.3, -0.02)
  for (let i = 0; i < 3; i++) add(body, rbox(0.2, 0.035, 0.03, 0.012), spot, 0, 0.2 + i * 0.09, 0.115)
  const head = group(body, 0, 0.5, 0)
  add(head, rbox(0.26, 0.24, 0.26, 0.09), col, 0, 0.08, 0.02)
  add(head, cylZ(0.04, 0.16, 8), col, 0, 0.04, 0.2)
  add(head, cylZ(0.055, 0.04, 8), spot, 0, 0.04, 0.29)
  eyes(head, 0.11, 0.15, 0.075, 0.065)
  add(head, cone(0.05, 0.1, 5), spot, 0, 0.24, 0)
  add(head, cone(0.035, 0.07, 5), spot, 0, 0.21, -0.08, -0.5)
  const fin = group(body, 0, 0.32, -0.15)
  add(fin, rbox(0.03, 0.18, 0.1, 0.012), spot, 0, 0, -0.04)
  fin.userData.side = 1
  const tail = group(body, 0, 0.14, -0.02)
  bar(tail, [0, 0, 0], [0, -0.14, -0.04], 0.14, 0.14, col)
  add(tail, torus(0.07, 0.04, TAU * 0.75, -Math.PI / 2, 6, 12), col, 0, -0.2, 0.02, -Math.PI / 2)
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY: 0.3, fins: [fin] }
  return root
}

// Spikes for the pufferfish, merged into one geometry (one draw call).
function spikesGeo() {
  return cached(geos, 'puffspikes', () => {
    const base = new ConeGeometry(0.035, 0.1, 4)
    const parts = []
    const m = new Matrix4()
    const q = new Quaternion()
    const d = new Vector3()
    const pos = new Vector3()
    const one = new Vector3(1, 1, 1)
    const n = 30
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n
      const r = Math.sqrt(1 - y * y)
      const a = i * 2.399963
      d.set(Math.cos(a) * r, y, Math.sin(a) * r)
      if (d.z > 0.45 && Math.abs(d.x) < 0.75 && Math.abs(d.y) < 0.7) continue // keep the face clear
      const k = Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z))
      pos.copy(d).multiplyScalar(Math.min(0.25 / k, 0.29) + 0.02)
      q.setFromUnitVectors(UP, d)
      parts.push(base.clone().applyMatrix4(m.compose(pos, q, one)))
    }
    base.dispose()
    return mergeGeometries(parts)
  })
}

function pufferfish(def) {
  const float = 0.5
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const spot = plastic(def.spot, 0.35)
  const bodyY = 0.28
  const torso = add(body, rbox(0.5, 0.48, 0.5, 0.16), col, 0, bodyY, 0)
  add(torso, spikesGeo(), spot)
  add(torso, rbox(0.42, 0.3, 0.42, 0.14), plastic('#fff6dc'), 0, -0.1, 0.045) // pale belly bulging out low at the front
  const head = group(body, 0, bodyY, 0)
  eyes(head, 0.06, 0.25, 0.1, 0.09, false)
  add(head, torus(0.03, 0.014, TAU, 0, 6, 10), plastic('#ff8a8a', 0.5), 0, -0.06, 0.255) // pouty mouth
  const fins = []
  for (const s of SIDES) {
    const f = group(body, s * 0.25, bodyY - 0.02, 0.02)
    f.userData.side = s
    add(f, rbox(0.03, 0.1, 0.12, 0.012), spot, s * 0.03, 0, -0.04)
    fins.push(f)
  }
  const tail = group(body, 0, bodyY, -0.25)
  add(tail, rbox(0.03, 0.18, 0.14, 0.012), spot, 0, 0, -0.06)
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY, fins }
  return root
}

function shark(def) {
  const float = 0.5
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const belly = plastic(def.spot)
  const bodyY = 0.2
  const torso = add(body, rbox(0.36, 0.32, 0.62, 0.11), col, 0, bodyY, -0.02)
  add(body, rbox(0.3, 0.06, 0.56, 0.03), belly, 0, bodyY - 0.15, 0)
  const head = group(body, 0, bodyY, 0.28)
  add(head, rbox(0.32, 0.26, 0.2, 0.1), col, 0, 0.02, 0.06)
  add(head, rbox(0.26, 0.08, 0.16, 0.04), belly, 0, -0.1, 0.05)
  add(head, rbox(0.18, 0.03, 0.012, 0.008), DARK(), 0, -0.06, 0.161)
  for (const x of [-0.06, 0, 0.06]) add(head, cone(0.018, 0.035, 4), WHITE(), x, -0.06, 0.165, Math.PI)
  eyes(head, 0.07, 0.16, 0.09, 0.065, false)
  const dorsal = add(body, cone(0.13, 0.24, 3), col, 0, bodyY + 0.24, -0.04, -0.35)
  dorsal.scale.x = 0.35
  const fins = []
  for (const s of SIDES) {
    const f = group(body, s * 0.17, bodyY - 0.08, 0.08)
    f.userData.side = s
    add(f, rbox(0.22, 0.03, 0.12, 0.012), col, s * 0.1, -0.02, -0.03, 0, s * 0.4, -s * 0.3)
    fins.push(f)
  }
  const tail = group(body, 0, bodyY + 0.01, -0.32)
  add(tail, rbox(0.2, 0.18, 0.2, 0.07), col, 0, 0, -0.08)
  add(tail, rbox(0.04, 0.24, 0.1, 0.02), col, 0, 0.1, -0.22, -0.5)
  add(tail, rbox(0.04, 0.16, 0.08, 0.02), col, 0, -0.06, -0.2, 0.6)
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY, fins }
  return root
}

function kraken(def) {
  const float = 0.55
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const spot = plastic(def.spot)
  const bodyY = 0.42
  const torso = add(body, rbox(0.5, 0.5, 0.46, 0.12), col, 0, bodyY, 0)
  add(body, rbox(0.1, 0.012, 0.1, 0.004), spot, 0.02, bodyY + 0.252, -0.04)
  add(body, rbox(0.012, 0.09, 0.09, 0.004), spot, 0.252, bodyY + 0.08, -0.06)
  add(body, rbox(0.012, 0.07, 0.07, 0.004), spot, -0.252, bodyY + 0.12, 0.02)
  add(body, rbox(0.1, 0.08, 0.012, 0.004), spot, -0.05, bodyY + 0.1, -0.232)
  const head = group(body, 0, bodyY, 0)
  eyes(head, -0.01, 0.23, 0.11, 0.09, true, true)
  add(head, rbox(0.08, 0.025, 0.012, 0.006), DARK(), 0, -0.14, 0.236)
  // 8 tentacles round the bottom; each pivot's local +Z points outward (Euler YXZ)
  const tentacles = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8
    const g = group(body, Math.sin(a) * 0.17, bodyY - 0.22, Math.cos(a) * 0.15)
    g.rotation.order = 'YXZ'
    g.rotation.y = a
    bar(g, [0, 0, 0], [0, -0.16, 0.1], 0.1, 0.1, col)
    const tip = group(g, 0, -0.16, 0.1)
    bar(tip, [0, 0, 0], [0, -0.02, 0.15], 0.075, 0.075, spot)
    g.userData.tip = tip
    tentacles.push(g)
  }
  const tail = group(body, 0, bodyY, -0.23)
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY, tentacles }
  return root
}

function stingray(def) {
  const float = 0.5
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const spot = plastic(def.spot)
  const bodyY = 0.1
  const torso = add(body, rbox(0.3, 0.12, 0.56, 0.05), col, 0, bodyY, 0)
  add(body, rbox(0.26, 0.02, 0.46, 0.008), WHITE(), 0, bodyY - 0.065, 0)
  const head = group(body, 0, bodyY, 0.2)
  add(head, rbox(0.22, 0.12, 0.2, 0.05), col, 0, 0.04, 0.0)
  eyes(head, 0.055, 0.1, 0.06, 0.045, false)
  // wings: a square plate turned 45 deg inside an X-stretched group = a diamond half; hinge at the body
  const wings = []
  for (const s of SIDES) {
    const w = group(body, s * 0.1, bodyY, 0)
    w.userData.side = s
    const sc = group(w)
    sc.scale.set(1.3, 1, 1)
    add(sc, rbox(0.26, 0.05, 0.26, 0.02), col, s * 0.153, 0, 0, 0, Math.PI / 4, 0)
    add(w, rbox(0.05, 0.012, 0.05, 0.004), spot, s * 0.2, 0.031, 0.03)
    add(w, rbox(0.04, 0.012, 0.04, 0.004), spot, s * 0.3, 0.031, -0.04)
    wings.push(w)
  }
  const tail = group(body, 0, bodyY, -0.28)
  bar(tail, [0, 0, 0], [0, 0.02, -0.42], 0.035, 0.035, col)
  add(tail, cone(0.03, 0.08, 4), spot, 0, 0.03, -0.2, -Math.PI / 2)
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY, wings, flat: true }
  return root
}


// --- Jungle (World 2) -------------------------------------------------------------------------
function monkey(def) {
  const p = quadruped({ bw: 0.36, bh: 0.34, bl: 0.4, legLen: 0.2, legW: 0.11, legX: 0.12, legZ: 0.13, head: [0.44, 0.4, 0.36], neck: [0.16, 0.18], color: def.color, radius: 0.1, hr: 0.12 })
  const face = plastic(def.spot)
  const col = plastic(def.color)
  const { head, faceY } = p
  const fz = p.face
  add(head, rbox(0.32, 0.28, 0.06, 0.05), face, 0, faceY - 0.01, fz + 0.005)
  add(head, rbox(0.22, 0.12, 0.1, 0.05), face, 0, faceY - 0.1, fz + 0.04)
  for (const s of SIDES) add(head, rbox(0.03, 0.025, 0.02, 0.008), DARK(), s * 0.035, faceY - 0.07, fz + 0.09)
  add(head, rbox(0.1, 0.02, 0.02, 0.008), DARK(), 0, faceY - 0.13, fz + 0.09)
  eyes(head, faceY + 0.05, fz + 0.035, 0.08, 0.065)
  for (const s of SIDES) {
    add(head, cylZ(0.11, 0.05, 16), col, s * 0.25, faceY + 0.04, 0.1, 0, Math.PI / 2, 0)
    add(head, cylZ(0.07, 0.055, 14), face, s * 0.255, faceY + 0.04, 0.1, 0, Math.PI / 2, 0)
  }
  add(head, rbox(0.12, 0.08, 0.12, 0.04), col, 0, faceY + 0.24, 0.02) // tuft
  add(p.body, rbox(0.24, 0.22, 0.03, 0.02), face, 0, p.bodyY - 0.02, 0.2) // belly
  // long curly tail
  add(p.tail, rbox(0.06, 0.06, 0.3, 0.025), col, 0, 0.06, -0.13, 0.7)
  const tip = group(p.tail, 0, 0.2, -0.23)
  add(tip, torus(0.09, 0.03, TAU * 0.8, -Math.PI / 2, 6, 14), col, 0, 0.08, 0, 0, Math.PI, 0)
  return p.root
}

function toucan(def) {
  const root = new Group()
  const hop = group(root)
  const body = group(hop)
  const col = plastic(def.color)
  const chest = plastic(def.spot)
  const beakCol = plastic(def.beak ?? '#ff9a1f', 0.3)
  const legLen = 0.18
  const bodyY = legLen + 0.2
  const torso = add(body, rbox(0.34, 0.42, 0.38, 0.12), col, 0, bodyY, 0)
  add(body, rbox(0.26, 0.26, 0.04, 0.06), chest, 0, bodyY + 0.04, 0.18)
  const head = group(body, 0, bodyY + 0.2, 0.06)
  add(head, rbox(0.3, 0.28, 0.28, 0.1), col, 0, 0.12, 0)
  add(head, rbox(0.24, 0.12, 0.04, 0.04), chest, 0, 0.06, 0.13)
  // the big curved beak (two tones)
  add(head, rbox(0.14, 0.15, 0.34, 0.05), beakCol, 0, 0.13, 0.28, -0.1)
  add(head, rbox(0.1, 0.06, 0.22, 0.03), plastic('#ffd21f', 0.3), 0, 0.2, 0.32, -0.12)
  add(head, rbox(0.12, 0.04, 0.08, 0.02), DARK(), 0, 0.09, 0.44, -0.2)
  eyes(head, 0.16, 0.14, 0.09, 0.055, false, true)
  const wings = []
  for (const s of SIDES) {
    const w = group(body, s * 0.17, bodyY + 0.1, 0)
    w.userData.side = s
    add(w, rbox(0.06, 0.3, 0.32, 0.04), col, s * 0.02, -0.08, -0.03)
    wings.push(w)
  }
  const tail = group(body, 0, bodyY - 0.08, -0.18)
  add(tail, rbox(0.2, 0.06, 0.26, 0.03), col, 0, -0.02, -0.1, 0.5)
  const legs = []
  for (const s of SIDES) {
    const hip = group(hop, s * 0.08, legLen + 0.02, 0.02)
    add(hip, rbox(0.045, legLen + 0.04, 0.045, 0.015), plastic('#5f8fff', 0.4), 0, -(legLen + 0.02) / 2, 0)
    add(hip, rbox(0.11, 0.03, 0.13, 0.012), plastic('#5f8fff', 0.4), 0, -(legLen + 0.02) + 0.015, 0.03)
    legs.push(hip)
  }
  root.userData = { legs, legPhase: [0, Math.PI], tail, head, headZ: head.position.z, body, hop, torso, bodyY, wings }
  return root
}

function frog(def) {
  const root = new Group()
  const hop = group(root)
  const body = group(hop)
  const col = plastic(def.color)
  const spot = plastic(def.spot)
  const belly = plastic(lighten(def.color, 0.55))
  const bodyY = 0.2
  const torso = add(body, rbox(0.5, 0.3, 0.46, 0.13), col, 0, bodyY, 0)
  add(body, rbox(0.4, 0.06, 0.34, 0.03), belly, 0, bodyY - 0.13, 0.04)
  for (const [x, z, r] of [[-0.12, -0.08, 0.07], [0.14, 0.02, 0.06], [0.02, -0.16, 0.05]]) add(body, rbox(r, 0.02, r, 0.008), spot, x, bodyY + 0.152, z)
  const head = group(body, 0, bodyY + 0.08, 0.14)
  add(head, rbox(0.46, 0.18, 0.24, 0.08), col, 0, 0.02, 0.04)
  for (const s of SIDES) {
    add(head, rbox(0.16, 0.16, 0.16, 0.07), col, s * 0.15, 0.13, 0.04)
    add(head, rbox(0.12, 0.12, 0.03, 0.05), WHITE(), s * 0.15, 0.14, 0.12)
    add(head, rbox(0.07, 0.09, 0.03, 0.02), EYE(), s * 0.15, 0.14, 0.135)
    add(head, rbox(0.025, 0.025, 0.01, 0.006), SHINE(), s * 0.15 - 0.015, 0.165, 0.152)
    add(head, rbox(0.06, 0.03, 0.012, 0.006), BLUSH(), s * 0.17, 0, 0.165)
  }
  add(head, rbox(0.26, 0.018, 0.02, 0.008), DARK(), 0, -0.02, 0.165)
  const legs = []
  for (const [x, z, back] of [[-0.2, 0.14, 0], [0.2, 0.14, 0], [-0.24, -0.14, 1], [0.24, -0.14, 1]]) {
    const hip = group(hop, x, 0.12, z)
    if (back) {
      add(hip, rbox(0.14, 0.14, 0.22, 0.05), col, Math.sign(x) * 0.03, -0.02, 0.0)
      add(hip, rbox(0.12, 0.04, 0.2, 0.015), spot, Math.sign(x) * 0.03, -0.1, 0.08)
    } else {
      add(hip, rbox(0.07, 0.12, 0.07, 0.03), col, 0, -0.05, 0)
      add(hip, rbox(0.12, 0.03, 0.12, 0.012), spot, 0, -0.11, 0.03)
    }
    legs.push(hip)
  }
  const tail = group(body, 0, bodyY, -0.22)
  root.userData = { legs, legPhase: [0, 0, 0, 0], tail, head, body, hop, torso, bodyY, hopper: true }
  return root
}

// Lizards: chameleon (crest, curled tail, turret eyes) and salamander (flat, spotted, wavy tail).
function lizard(def, kind) {
  const p = quadruped({ bw: 0.32, bh: 0.24, bl: 0.6, legLen: 0.14, legW: 0.09, legX: 0.17, legZ: 0.2, head: [0.3, 0.24, 0.3], neck: [0.06, 0.3], color: def.color, radius: 0.08 })
  const spot = plastic(def.spot)
  const col = plastic(def.color)
  const { head, faceY } = p
  const fz = p.face
  if (kind === 'chameleon') {
    for (let i = 0; i < 5; i++) add(p.body, cone(0.045, 0.1, 4), spot, 0, p.bodyY + 0.15, 0.22 - i * 0.11)
    add(head, cone(0.12, 0.16, 4), col, 0, faceY + 0.17, -0.04, -0.6)
    for (const s of SIDES) add(head, cylZ(0.075, 0.1, 12), col, s * 0.15, faceY + 0.06, fz - 0.05, 0, s * 0.6, 0)
    eyes(head, faceY + 0.06, fz, 0.1, 0.05, false)
    add(p.body, rbox(0.33, 0.04, 0.1, 0.015), spot, 0, p.bodyY + 0.02, 0.05)
    add(p.body, rbox(0.33, 0.04, 0.1, 0.015), spot, 0, p.bodyY + 0.02, -0.15)
    add(p.tail, rbox(0.09, 0.09, 0.26, 0.04), col, 0, -0.02, -0.12)
    const curl = group(p.tail, 0, -0.04, -0.26)
    add(curl, torus(0.08, 0.035, TAU * 0.85, -Math.PI / 2, 6, 14), col, 0, -0.06, 0, 0, Math.PI, 0)
  } else {
    for (const [x, z] of [[-0.09, 0.15], [0.1, 0.0], [-0.08, -0.16], [0.09, 0.22], [0, -0.06]]) add(p.body, rbox(0.07, 0.02, 0.07, 0.01), spot, x, p.bodyY + 0.122, z)
    eyes(head, faceY + 0.05, fz, 0.08, 0.06, false, true)
    add(head, rbox(0.18, 0.015, 0.02, 0.006), DARK(), 0, faceY - 0.06, fz + 0.01)
    add(p.tail, rbox(0.12, 0.1, 0.3, 0.04), col, 0, -0.02, -0.14)
    const t2 = group(p.tail, 0, -0.03, -0.29)
    add(t2, rbox(0.08, 0.07, 0.24, 0.03), col, 0, 0, -0.1)
    add(t2, rbox(0.06, 0.02, 0.06, 0.008), spot, 0, 0.045, -0.12)
    p.root.userData.tail2 = t2
  }
  return p.root
}
const chameleon = (def) => lizard(def, 'chameleon')
const salamander = (def) => lizard(def, 'salamander')

function tiger(def) {
  const p = quadruped({ bw: 0.44, bh: 0.36, bl: 0.66, legLen: 0.24, legW: 0.13, legX: 0.14, legZ: 0.22, head: [0.44, 0.38, 0.38], neck: [0.12, 0.3], color: def.color })
  const stripe = plastic(def.spot)
  const col = plastic(def.color)
  const white = plastic('#fff6e8')
  const { head, faceY } = p
  const fz = p.face
  for (const s of SIDES) {
    add(head, pyramid(0.09, 0.14), col, s * 0.14, faceY + 0.25, 0.08)
    add(head, pyramid(0.05, 0.08), stripe, s * 0.14, faceY + 0.24, 0.12)
  }
  add(head, rbox(0.24, 0.12, 0.08, 0.04), white, 0, faceY - 0.08, fz + 0.03)
  add(head, rbox(0.07, 0.045, 0.03, 0.012), DARK(), 0, faceY - 0.04, fz + 0.075)
  for (const s of SIDES) for (const dy of [0.12, 0.2]) add(head, rbox(0.1, 0.025, 0.012, 0.006), stripe, s * 0.12, faceY + dy, fz + 0.004, 0, 0, s * 0.3)
  add(head, rbox(0.03, 0.12, 0.012, 0.006), stripe, 0, faceY + 0.17, fz + 0.004)
  eyes(head, faceY + 0.05, fz, 0.1, 0.075, false, lum(def.color) < 0.3)
  if (def.eye) for (const s of SIDES) add(head, rbox(0.05, 0.065, 0.012, 0.01), plastic(def.eye, 0.2), s * 0.1, faceY + 0.05, fz + 0.03)
  // body markings: stripes (tiger) or rosettes (jaguar)
  if (def.spots) {
    for (let i = 0; i < 9; i++) add(p.body, rbox(0.07, 0.02, 0.07, 0.01), stripe, ((i % 3) - 1) * 0.13, p.bodyY + 0.182, 0.22 - Math.floor(i / 3) * 0.2)
  } else {
    for (let i = 0; i < 4; i++) {
      add(p.body, rbox(0.46, 0.03, 0.05, 0.012), stripe, 0, p.bodyY + 0.17, 0.2 - i * 0.14)
      for (const s of SIDES) add(p.body, rbox(0.03, 0.18, 0.05, 0.012), stripe, s * 0.222, p.bodyY + 0.05, 0.2 - i * 0.14)
    }
  }
  add(p.body, rbox(0.3, 0.03, 0.4, 0.012), white, 0, p.bodyY - 0.172, 0.02)
  add(p.tail, rbox(0.08, 0.08, 0.32, 0.03), col, 0, 0.08, -0.13, 0.6)
  add(p.tail, rbox(0.09, 0.09, 0.08, 0.03), stripe, 0, 0.2, -0.27, 0.6)
  return p.root
}

function gorilla(def) {
  const p = quadruped({ bw: 0.62, bh: 0.5, bl: 0.5, legLen: 0.2, legW: 0.15, legX: 0.18, legZ: 0.12, head: [0.4, 0.38, 0.34], neck: [0.2, 0.22], color: def.color, radius: 0.12 })
  const silver = plastic(def.spot)
  const col = plastic(def.color)
  const skin = plastic(lum(def.color) > 0.6 ? lighten(def.color, 0.35) : '#2a2228')
  const { head, faceY } = p
  const fz = p.face
  // front legs are big arms (knuckle walking)
  for (const i of [0, 1]) {
    const arm = p.legs[i]
    add(arm, rbox(0.2, 0.36, 0.2, 0.06), col, 0, -0.08, 0.04)
    add(arm, rbox(0.22, 0.1, 0.22, 0.04), skin, 0, -0.2, 0.06)
  }
  p.body.rotation.x = -0.12
  add(p.body, rbox(0.52, 0.16, 0.46, 0.06), silver, 0, p.bodyY + 0.2, -0.04) // silver back
  add(p.body, rbox(0.36, 0.3, 0.04, 0.06), skin, 0, p.bodyY, 0.25) // chest
  add(head, rbox(0.3, 0.26, 0.06, 0.06), skin, 0, faceY - 0.04, fz + 0.01)
  add(head, rbox(0.34, 0.07, 0.08, 0.03), col, 0, faceY + 0.1, fz + 0.02) // brow
  add(head, rbox(0.22, 0.11, 0.08, 0.04), skin, 0, faceY - 0.12, fz + 0.05)
  for (const s of SIDES) add(head, rbox(0.035, 0.03, 0.02, 0.008), DARK(), s * 0.04, faceY - 0.08, fz + 0.095)
  add(head, rbox(0.12, 0.02, 0.02, 0.008), DARK(), 0, faceY - 0.15, fz + 0.095)
  eyes(head, faceY + 0.03, fz + 0.04, 0.08, 0.055, false, true)
  if (lum(def.color) > 0.6) {
    // Idol Kong: a jade crown
    for (let i = -2; i <= 2; i++) add(head, cone(0.04, 0.12, 4), silver, i * 0.07, faceY + 0.27, 0.08)
    add(head, rbox(0.36, 0.05, 0.3, 0.02), silver, 0, faceY + 0.2, 0.06)
  }
  return p.root
}

// --- Volcano (World 3) --------------------------------------------------------------------------
function imp(def) {
  const float = 0.5
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const spot = plastic(def.spot)
  const torso = add(body, rbox(0.34, 0.36, 0.3, 0.12), col, 0, 0.2, 0)
  add(body, rbox(0.22, 0.2, 0.03, 0.06), spot, 0, 0.16, 0.15)
  const head = group(body, 0, 0.44, 0.02)
  add(head, rbox(0.38, 0.34, 0.34, 0.12), col, 0, 0.06, 0)
  for (const s of SIDES) add(head, cone(0.05, 0.18, 5), plastic('#2a1a1e'), s * 0.13, 0.28, 0, 0, 0, -s * 0.35)
  eyes(head, 0.09, 0.17, 0.09, 0.07, false, true)
  add(head, rbox(0.16, 0.03, 0.02, 0.01), DARK(), 0, -0.03, 0.172)
  for (const s of SIDES) add(head, cone(0.018, 0.05, 4), WHITE(), s * 0.045, -0.055, 0.175, Math.PI)
  const wings = []
  for (const s of SIDES) {
    const w = group(body, s * 0.15, 0.3, -0.12)
    w.userData.side = s
    bar(w, [0, 0, 0], [s * 0.32, 0.16, -0.06], 0.04, 0.04, col)
    add(w, rbox(0.3, 0.02, 0.2, 0.01), spot, s * 0.18, 0.04, -0.1, 0, 0, s * 0.3)
    wings.push(w)
  }
  const tail = group(body, 0, 0.08, -0.15)
  bar(tail, [0, 0, 0], [0, -0.12, -0.24], 0.035, 0.035, col)
  add(tail, pyramid(0.07, 0.1), spot, 0, -0.14, -0.27, -Math.PI / 2)
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY: 0.2, wings }
  return root
}

function slime(def) {
  const { root, hop, body } = swimmer(0)
  const col = cached(mats, key('slime', def.color), () => new MeshStandardMaterial({ color: def.color, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.92 }))
  const spot = plastic(def.spot)
  const torso = add(body, rbox(0.56, 0.44, 0.52, 0.2), col, 0, 0.22, 0)
  add(body, rbox(0.36, 0.2, 0.34, 0.12), col, 0, 0.48, -0.02)
  for (const [x, y, z] of [[-0.2, 0.08, 0.2], [0.22, 0.12, 0.16], [0.1, 0.36, -0.2], [-0.18, 0.3, -0.18]]) add(body, rbox(0.08, 0.08, 0.08, 0.035), spot, x, y, z)
  const head = group(body, 0, 0.26, 0.26)
  eyes(head, 0.06, 0.005, 0.11, 0.08, true, true)
  add(head, rbox(0.12, 0.04, 0.02, 0.015), DARK(), 0, -0.06, 0.008)
  const tail = group(body, 0, 0.2, -0.26)
  root.userData = { legs: [], legPhase: [], swim: true, float: 0, tail, head, body, hop, torso, bodyY: 0.22, blob: true }
  return root
}

function golem(def) {
  const p = quadruped({ bw: 0.56, bh: 0.46, bl: 0.54, legLen: 0.22, legW: 0.18, legX: 0.18, legZ: 0.16, head: [0.36, 0.3, 0.3], neck: [0.16, 0.26], color: def.color, radius: 0.04, hr: 0.04 })
  const glowM = plastic(def.spot)
  const dark = plastic(lighten(def.color, 0.12))
  const { head, faceY } = p
  const fz = p.face
  // rock chunks + glowing cracks
  for (const [x, y, z, w] of [[-0.2, 0.2, 0.1, 0.2], [0.18, 0.22, -0.12, 0.22], [0, 0.26, 0.0, 0.18], [-0.12, 0.18, -0.2, 0.16]]) add(p.body, rbox(w, w * 0.8, w, 0.03), dark, x, p.bodyY + y, z, 0.2, x * 2, 0.1)
  for (const [x, z, ry] of [[0.0, 0.1, 0.4], [-0.1, -0.12, -0.6], [0.14, -0.04, 1.2]]) add(p.body, rbox(0.22, 0.015, 0.03, 0.006), glowM, x, p.bodyY + 0.235, z, 0, ry, 0)
  for (const s of SIDES) add(p.body, rbox(0.015, 0.2, 0.03, 0.006), glowM, s * 0.282, p.bodyY, 0.05, 0, 0, s * 0.3)
  add(p.body, rbox(0.3, 0.2, 0.02, 0.006), glowM, 0, p.bodyY, 0.272) // glowing core
  for (const leg of p.legs) add(leg, rbox(0.22, 0.1, 0.22, 0.03), dark, 0, -0.2, 0)
  add(head, rbox(0.4, 0.08, 0.1, 0.02), dark, 0, faceY + 0.1, fz + 0.02) // brow
  for (const s of SIDES) {
    add(head, rbox(0.09, 0.05, 0.02, 0.008), glowM, s * 0.09, faceY + 0.02, fz + 0.008)
    add(head, rbox(0.12, 0.12, 0.12, 0.02), dark, s * 0.2, faceY + 0.12, 0.0, 0.3, 0, s * 0.3)
  }
  add(head, rbox(0.16, 0.03, 0.02, 0.006), glowM, 0, faceY - 0.08, fz + 0.008)
  add(p.tail, rbox(0.1, 0.1, 0.1, 0.02), dark, 0, 0, -0.03)
  return p.root
}

function phoenix(def) {
  const float = 0.55
  const { root, hop, body } = swimmer(float)
  const col = plastic(def.color)
  const spot = plastic(def.spot)
  const beak = plastic('#ffd21f', 0.3)
  const torso = add(body, rbox(0.32, 0.34, 0.42, 0.12), col, 0, 0.18, 0)
  add(body, rbox(0.22, 0.2, 0.04, 0.05), spot, 0, 0.16, 0.2)
  const head = group(body, 0, 0.36, 0.14)
  add(head, rbox(0.26, 0.26, 0.26, 0.09), col, 0, 0.06, 0)
  add(head, cone(0.06, 0.14, 4), beak, 0, 0.03, 0.18, Math.PI / 2)
  for (let i = 0; i < 3; i++) add(head, cone(0.04, 0.2 - i * 0.03, 4), spot, 0, 0.2 + i * 0.02, -0.04 - i * 0.06, -0.6 - i * 0.2)
  eyes(head, 0.1, 0.13, 0.075, 0.055, false, true)
  const wings = []
  for (const s of SIDES) {
    const w = group(body, s * 0.15, 0.26, 0)
    w.userData.side = s
    add(w, rbox(0.36, 0.04, 0.3, 0.02), col, s * 0.2, 0.02, -0.02, 0, 0, s * 0.2)
    add(w, rbox(0.3, 0.035, 0.2, 0.015), spot, s * 0.42, 0.08, -0.1, 0, 0, s * 0.3)
    add(w, cone(0.05, 0.22, 4), spot, s * 0.55, 0.13, -0.18, Math.PI / 2, 0, s * 0.6)
    wings.push(w)
  }
  const tail = group(body, 0, 0.12, -0.22)
  for (const [ry, len] of [[-0.35, 0.36], [0, 0.46], [0.35, 0.36]]) {
    const f = group(tail, 0, 0, 0)
    f.rotation.y = ry
    add(f, rbox(0.07, 0.03, len, 0.012), spot, 0, -0.04, -len / 2, 0.3)
    add(f, cone(0.05, 0.12, 4), col, 0, -0.1, -len - 0.02, -Math.PI / 2 + 0.3)
  }
  root.userData = { legs: [], legPhase: [], swim: true, float, tail, head, body, hop, torso, bodyY: 0.18, wings }
  return root
}

const KINDS = { dog, cat, bunny, pig, fox, panda, crab, dragon, chicken, cow, goat, horse, bull, llama, seahorse, pufferfish, shark, kraken, stingray, monkey, toucan, frog, chameleon, tiger, gorilla, salamander, imp, slime, golem, phoenix }

// def: { kind, color, spot, size?, ...kind extras (dog: ears, fluffy, bow) } from PETS.
export function buildPet(def) {
  const pet = (KINDS[def.kind] ?? dog)(def)
  pet.name = 'pet:' + def.kind
  pet.userData.kind = def.kind
  const size = def.size ?? 1
  if (size !== 1) pet.scale.setScalar(size)
  // Lava pets: their accent colour glows (HDR emissive, blooms on High/Ultra).
  if (def.glow) {
    const spot = plastic(def.spot)
    const hot = cached(mats, key('glow', def.spot), () => new MeshStandardMaterial({ color: def.spot, roughness: 0.35, emissive: def.spot, emissiveIntensity: 1.6 }))
    pet.traverse((o) => {
      if (o.isMesh && o.material === spot) o.material = hot
    })
  }
  return pet
}

// Hanging tails (cow, horse, bull) swish sideways about Z; the rest wag about Y.
function wagTail(u, a) {
  if (u.tailZ) u.tail.rotation.z = a * 0.6
  else u.tail.rotation.y = a
}

// Sea creatures: hover on the hop group, bob, and wiggle fins/tails/tentacles instead of walking.
function swim(u, t, moving) {
  const kind = u.kind
  const ph = t * (moving ? 7 : 2.4)
  u.hop.position.y = u.float + Math.sin(t * (moving ? 4 : 1.7)) * (moving ? 0.03 : 0.05)
  u.torso.scale.set(1, 1, 1)
  u.head.rotation.set(0, moving ? 0 : Math.sin(t * 0.9) * 0.15, 0)
  u.tail.rotation.set(0, 0, 0)
  if (kind === 'seahorse') {
    u.body.rotation.set(moving ? 0.22 : Math.sin(t * 1.3) * 0.06, 0, Math.sin(t * 1.1) * 0.05)
    u.tail.rotation.x = Math.sin(ph) * 0.25
  } else if (kind === 'pufferfish') {
    u.body.rotation.set(0, 0, Math.sin(t * 1.2) * 0.06)
    u.torso.scale.setScalar(1 + Math.sin(t * (moving ? 3 : 1.4)) * 0.05)
    u.tail.rotation.y = Math.sin(ph * 1.6) * 0.5
  } else if (kind === 'shark') {
    u.body.rotation.set(0, Math.sin(ph) * 0.08, Math.sin(t * 1.1) * 0.04)
    u.head.rotation.y = -Math.sin(ph) * 0.06
    u.tail.rotation.y = Math.sin(ph - 1) * 0.45
  } else if (u.blob) {
    const k = moving ? Math.abs(Math.sin(t * 7)) : Math.abs(Math.sin(t * 2)) * 0.3
    u.hop.position.y = k * (moving ? 0.22 : 0.04)
    u.torso.scale.set(1 + (1 - k) * 0.12, 1 - (1 - k) * 0.14 + k * 0.06, 1 + (1 - k) * 0.12)
    u.body.rotation.set(0, 0, Math.sin(t * 1.6) * 0.05)
  } else if (kind === 'kraken') {
    u.body.rotation.set(0, 0, Math.sin(t * 1.3) * 0.06)
    u.torso.scale.set(1, 1 + Math.sin(ph) * 0.04, 1)
  } else {
    u.body.rotation.set(Math.sin(ph) * 0.04, 0, 0)
    u.tail.rotation.y = Math.sin(ph - 1.2) * 0.35
  }
  if (u.fins) {
    const f = Math.sin(t * (moving ? 22 : 12))
    for (const fin of u.fins) {
      if (kind === 'seahorse') fin.rotation.y = f * 0.5
      else if (kind === 'shark') fin.rotation.z = fin.userData.side * Math.sin(t * 2.5) * 0.12
      else fin.rotation.y = fin.userData.side * f * 0.5
    }
  }
  if (u.wings) {
    const f = Math.sin(ph)
    for (const w of u.wings) w.rotation.z = w.userData.side * f * (moving ? 0.35 : 0.2)
  }
  if (u.tentacles) {
    const amp = moving ? 0.35 : 0.2
    u.tentacles.forEach((g, i) => {
      g.rotation.x = Math.sin(ph + i * 0.8) * amp - (moving ? 0.2 : 0)
      g.userData.tip.rotation.x = Math.sin(ph + i * 0.8 - 1) * 0.45
    })
  }
}

// t = elapsed seconds (callers add their own phase offset per pet).
export function animatePet(pet, t, moving) {
  const u = pet.userData
  if (!u.legs) return
  if (u.swim) return swim(u, t, moving)
  const kind = u.kind
  if (moving) {
    const w = t * (kind === 'crab' ? 14 : 11)
    if (kind === 'bunny' || u.hopper) {
      const h = Math.sin(t * 8)
      u.hop.position.y = Math.max(0, h) * 0.12
      u.legs.forEach((leg, i) => (leg.rotation.x = (i < 2 ? -1 : 1) * Math.max(0, h) * 0.5))
      u.body.position.y = 0
    } else {
      u.hop.position.y = 0
      u.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(w + u.legPhase[i]) * (kind === 'crab' ? 0.4 : 0.6)))
      u.body.position.y = Math.abs(Math.sin(w)) * 0.035
    }
    u.body.rotation.z = kind === 'crab' ? Math.sin(w) * 0.04 : 0
    u.torso.scale.set(1, 1, 1)
    wagTail(u, Math.sin(t * 16) * 0.55)
    u.head.rotation.set(Math.sin(w * 2) * 0.05, 0, 0)
    // chickens bob the head back and forth with each step
    if (u.headZ !== undefined) u.head.position.z = u.headZ + Math.sin(w) * 0.035
  } else {
    const b = Math.sin(t * 2.2)
    u.hop.position.y = 0
    for (const leg of u.legs) leg.rotation.x = 0
    u.body.position.y = b * 0.006
    u.body.rotation.z = 0
    u.torso.scale.set(1 + b * 0.012, 1 + b * 0.02, 1)
    wagTail(u, Math.sin(t * 3) * 0.28)
    // every ~7 s the head tilts curiously for a moment
    const c = t % 7
    const tilt = c > 5 ? Math.sin(((c - 5) / 2) * Math.PI) : 0
    u.head.rotation.set(Math.sin(t * 1.3) * 0.04, tilt * 0.2, tilt * 0.28)
    if (u.headZ !== undefined) {
      // chicken: a quick double peck every ~5 s
      u.head.position.z = u.headZ
      const k = t % 5
      if (k > 4.2) u.head.rotation.x = Math.max(0, Math.sin(((k - 4.2) / 0.8) * Math.PI * 2)) * 0.7
    }
  }
  if (u.tail2) u.tail2.rotation.y = Math.sin(t * (moving ? 16 : 3) - 0.8) * 0.4
  if (u.wings) {
    if (kind === 'chicken') {
      const f = moving ? Math.max(0, Math.sin(t * 14)) * 0.6 : Math.max(0, Math.sin(t * 2)) * 0.06
      for (const w of u.wings) w.rotation.z = w.userData.side * (0.05 + f)
    } else {
      const f = moving ? Math.sin(t * 14) : Math.sin(t * 3) * 0.5
      for (const w of u.wings) w.rotation.z = w.userData.side * (0.35 + f * 0.45)
    }
  }
  if (u.claws) {
    const pinch = (Math.sin(t * (moving ? 9 : 2.5)) * 0.5 + 0.5) * 0.45
    for (const j of u.claws) j.rotation.x = -pinch
  }
}

// --- Eggs ---------------------------------------------------------------------
const EGG_H = 1.3
const EGG_R = 0.47
function eggGeo() {
  return cached(geos, 'egg', () => {
    const pts = []
    const n = 40
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI
      pts.push(new Vector2(Math.max(0.0005, EGG_R * Math.sin(t) * (1 + 0.12 * Math.cos(t))), (EGG_H * (1 - Math.cos(t))) / 2))
    }
    return new LatheGeometry(pts, 48)
  })
}
function eggTexture(def) {
  return cached(mats, key('eggtex', def.id ?? '', def.color, def.spots), () => {
    const W = 512
    const H = 256
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    ctx.fillStyle = def.color
    ctx.fillRect(0, 0, W, H)
    let seed = 99
    for (const ch of String(def.id ?? def.color)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
    const rand = mulberry32(seed)
    // Blobs wrap horizontally and are widened toward the poles (where the lathe squeezes u),
    // so they read round on the egg. Vertical px are ~1.2x horizontal ones at the equator.
    const dot = (x, y, r, fill, ry = r * 0.85) => {
      const st = Math.max(0.3, Math.sin((y / H) * Math.PI))
      ctx.fillStyle = fill
      for (const dx of [-W, 0, W]) {
        ctx.beginPath()
        ctx.ellipse(x + dx, y, r / st, ry, 0, 0, TAU)
        ctx.fill()
      }
    }
    // cow egg (or def.pattern 'patches'): big irregular blotches; else round spots
    const patches = def.pattern === 'patches' || (def.pattern === undefined && def.id === 'cow')
    // white eggs get spots all over; coloured eggs keep the zig-zag band clear
    const band = lum(def.color) < 0.85
    if (patches) {
      for (let i = 0; i < 11; i++) {
        const x = rand() * W
        const y = H * (0.1 + rand() * 0.8)
        const r = 16 + rand() * 16
        for (let j = 0; j < 4; j++) dot(x + (rand() - 0.5) * r * 1.6, y + (rand() - 0.5) * r, r * (0.5 + rand() * 0.45), def.spots, r * (0.4 + rand() * 0.35))
      }
    } else {
      const n = band ? 26 : 30
      for (let i = 0; i < n; i++) {
        const top = rand() < 0.5
        const y = band ? (top ? H * (0.1 + rand() * 0.24) : H * (0.64 + rand() * 0.24)) : H * (0.08 + rand() * 0.84)
        const r = (band ? 9 : 7) + rand() * 15
        dot(rand() * W, y, r, def.spots)
        if (band && rand() < 0.5) dot(rand() * W, y + (rand() - 0.5) * 30, r * 0.35, 'rgba(255,255,255,0.75)')
      }
    }
    if (!band) {
      const t = new CanvasTexture(c)
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 4
      return t
    }
    // zig-zag band around the middle
    const y0 = H * 0.5
    const amp = H * 0.06
    const teeth = 10
    const zig = () => {
      ctx.beginPath()
      for (let i = 0; i <= teeth * 2; i++) {
        const x = (i / (teeth * 2)) * W
        const y = y0 + (i % 2 ? -amp : amp)
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
    }
    ctx.lineJoin = 'round'
    zig()
    ctx.lineWidth = 34
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    zig()
    ctx.lineWidth = 22
    ctx.strokeStyle = def.spots
    ctx.stroke()
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  })
}
// def: { id, color, spots, pattern? } from EGGS. Origin at the bottom of the egg; userData.egg is the mesh.
export function buildEgg(def) {
  const g = new Group()
  g.name = 'egg:' + (def.id ?? '')
  const mat = cached(mats, key('eggmat', def.id ?? '', def.color, def.spots), () => new MeshStandardMaterial({ map: eggTexture(def), roughness: 0.22, metalness: 0.05 }))
  const egg = add(g, eggGeo(), mat)
  g.userData = { egg, height: EGG_H, radius: EGG_R }
  return g
}
