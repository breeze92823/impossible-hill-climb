// Shared building kit for the World 2 / World 3 hubs and courses (worldhub.js, jungle.js, volcano.js).
//  - Batch: many coloured boxes / cylinders / cones merged into ONE vertex-coloured mesh (one draw
//    call per set piece: a croc, a totem, a temple), optionally studded like the rest of the game.
//  - animated surface shaders: river water and molten lava (HDR, so the lava blooms)
//  - outlined text signs (static + repaintable), fixed colliders (boxes, trimeshes, wedges)
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAPIER, addFixed } from '../physics.js'
import { label } from '../propkit.js'
import { studTexture, triplanarize } from './materials.js'

export const TAU = Math.PI * 2
export const SIDES = [-1, 1]

// --- Batched vertex-coloured meshes ---------------------------------------------------------
const unitBox = new BoxGeometry(1, 1, 1)
const cylCache = new Map()
const coneCache = new Map()
const rockGeo = new DodecahedronGeometry(1, 0)
const ballGeo = new SphereGeometry(1, 12, 8)
const m4 = new Matrix4()
const q4 = new Quaternion()
const e4 = new Euler()
const v4 = new Vector3()
const s4 = new Vector3()
const c4 = new Color()

let vcStud = null
let vcPlain = null
// Shared materials for batches: studded plastic (world-space studs) or smooth plastic.
export function batchMaterial(studs = true) {
  if (studs) return (vcStud ||= triplanarize(new MeshStandardMaterial({ map: studTexture(), vertexColors: true, roughness: 0.6 }), 1.2))
  return (vcPlain ||= new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.02 }))
}

export class Batch {
  constructor() {
    this.geos = []
  }
  // Adds a unit geometry scaled (sx, sy, sz), rotated (rx, ry, rz, Euler XYZ) and placed at (x, y, z).
  push(geo, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m4.compose(v4.set(x, y, z), q4.setFromEuler(e4.set(rx, ry, rz)), s4.set(sx, sy, sz)))
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    c4.set(color)
    for (let i = 0; i < n; i++) col.set([c4.r, c4.g, c4.b], i * 3)
    g.setAttribute('color', new BufferAttribute(col, 3))
    this.geos.push(g)
    return this
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.push(unitBox, color, x, y, z, w, h, d, rx, ry, rz)
  }
  // Cylinder of radius r (top rTop) and height h, axis along Y.
  cyl(r, h, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10, rTop = r) {
    const k = `${(rTop / r).toFixed(3)}|${seg}`
    let g = cylCache.get(k)
    if (!g) cylCache.set(k, (g = new CylinderGeometry(rTop / r, 1, 1, seg)))
    return this.push(g, color, x, y, z, r, h, r, rx, ry, rz)
  }
  cone(r, h, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 6) {
    let g = coneCache.get(seg)
    if (!g) coneCache.set(seg, (g = new ConeGeometry(1, 1, seg)))
    return this.push(g, color, x, y, z, r, h, r, rx, ry, rz)
  }
  rock(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0) {
    return this.push(rockGeo, color, x, y, z, r * sx, r * sy, r * sz, 0, ry, 0)
  }
  ball(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    return this.push(ballGeo, color, x, y, z, r * sx, r * sy, r * sz)
  }
  // A bar from a to b ([x, y, z]) with a w x w cross-section.
  bar(a, b, w, color) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const len = Math.hypot(dx, dy, dz) || 1
    q4.setFromUnitVectors(new Vector3(0, 1, 0), v4.set(dx / len, dy / len, dz / len))
    const g = unitBox.toNonIndexed().applyMatrix4(m4.compose(new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q4, s4.set(w, len, w)))
    g.deleteAttribute('uv')
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    c4.set(color)
    for (let i = 0; i < n; i++) col.set([c4.r, c4.g, c4.b], i * 3)
    g.setAttribute('color', new BufferAttribute(col, 3))
    this.geos.push(g)
    return this
  }
  get empty() {
    return this.geos.length === 0
  }
  // One mesh for everything pushed so far (null when empty).
  build(material = batchMaterial(true), shadows = true) {
    if (!this.geos.length) return null
    const geo = mergeGeometries(this.geos)
    for (const g of this.geos) g.dispose()
    this.geos = []
    const mesh = new Mesh(geo, material)
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    return mesh
  }
}

// --- Animated surfaces ------------------------------------------------------------------------
const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }`

// River water in world space: flowing ripples, bright crests, deeper colour away from the light.
// flow = [x, z] m/s the pattern drifts. Fogged like the rest of the scene.
export function waterMaterial({ deep = '#0d6a5a', shallow = '#2fc6a0', foam = '#e8fff4', flow = [0, 1.6] } = {}) {
  return new ShaderMaterial({
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { t: { value: 0 }, deep: { value: new Color(deep) }, shallow: { value: new Color(shallow) }, foam: { value: new Color(foam) }, flow: { value: flow } }]),
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float t; uniform vec3 deep; uniform vec3 shallow; uniform vec3 foam; uniform vec2 flow;
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        vec2 p = vW.xz * 0.08 - flow * t * 0.08;
        float n = fbm(p) * 0.65 + fbm(p * 2.7 + vec2(t * 0.05, -t * 0.11)) * 0.35;
        vec3 col = mix(deep, shallow, smoothstep(0.3, 0.75, n));
        float crest = smoothstep(0.62, 0.7, fbm(vW.xz * 0.21 - flow * t * 0.21));
        col = mix(col, foam, crest * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
}

// Molten lava: slow churning crust with glowing cracks (HDR, blooms on High/Ultra). Fogged.
export function lavaMaterial({ hot = [3.2, 1.1, 0.12], warm = [1.4, 0.25, 0.03], crust = '#2a1416', flow = [0, 0.6], scale = 0.06 } = {}) {
  return new ShaderMaterial({
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { t: { value: 0 }, hot: { value: new Vector3(...hot) }, warm: { value: new Vector3(...warm) }, crust: { value: new Color(crust) }, flow: { value: flow }, sc: { value: scale } }]),
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float t; uniform vec3 hot; uniform vec3 warm; uniform vec3 crust; uniform vec2 flow; uniform float sc;
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        vec2 p = vW.xz * sc - flow * t * sc;
        float n = fbm(p + vec2(fbm(p * 1.7 + t * 0.03), fbm(p * 1.3 - t * 0.04)) * 1.6);
        float cracks = smoothstep(0.42, 0.58, n);
        float pulse = 0.85 + 0.15 * sin(t * 1.7 + n * 9.0);
        vec3 glowc = mix(warm, hot, smoothstep(0.55, 0.85, n)) * pulse;
        vec3 col = mix(crust, glowc, cracks);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
}

// A vertical sheet of falling water / lava (uv.y runs down); scrolls with time.
export function fallMaterial(a = [0.75, 0.95, 1.0], b = [1.6, 1.8, 1.9], speed = 1.4) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { t: { value: 0 }, a: { value: new Vector3(...a) }, b: { value: new Vector3(...b) }, sp: { value: speed } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float t; uniform vec3 a; uniform vec3 b; uniform float sp; varying vec2 vUv;
      ${NOISE}
      void main(){
        float n = fbm(vec2(vUv.x * 9.0, vUv.y * 3.0 + t * sp));
        float streak = smoothstep(0.45, 0.8, n);
        vec3 col = mix(a, b, streak);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(col, edge * (0.72 + 0.28 * streak));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

// --- Text --------------------------------------------------------------------------------------
// Several outlined lines stacked, each its own sprite (own colour/size).
export function sign(parent, x, y, z, lines) {
  const g = new Group()
  let yy = 0
  for (const l of lines) {
    const s = label(l.text, l.size, { color: l.color, outline: l.outline ?? '#14112b', outlineWidth: l.ow ?? 16 })
    s.position.y = yy
    yy -= l.size * (l.gap ?? 0.95)
    g.add(s)
  }
  g.position.set(x, y, z)
  parent.add(g)
  return g
}
// One repaintable text sprite (timers, live values): sprite.userData.set(text, color).
export function textSprite(height, w = 512) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = 128
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  s.scale.set((height * w) / 128, height, 1)
  let last = ''
  s.userData.set = (text, color = '#ffffff', outline = '#14112b') => {
    if (text === last) return
    last = text
    const g = c.getContext('2d')
    g.clearRect(0, 0, w, 128)
    g.font = '700 84px Fredoka, "Arial Black", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.lineWidth = 16
    g.strokeStyle = outline
    g.strokeText(text, w / 2, 68)
    g.fillStyle = color
    g.fillText(text, w / 2, 68)
    tex.needsUpdate = true
  }
  return s
}

// --- Colliders ---------------------------------------------------------------------------------
export function boxCollider(hx, hy, hz, x, y, z, yaw = 0, opts) {
  const q = yaw ? { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } : null
  return addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z }, q, opts)
}
export function trimeshCollider(positions, indices, opts = { friction: 0.9 }) {
  return addFixed(RAPIER.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(indices)), { x: 0, y: 0, z: 0 }, null, opts)
}
// A ramp wedge in world space: floor at y0 from z0 (low end) to z1 (the lip, height h above y0),
// x from x0 to x1. Returns { geometry, positions, indices } (also used for the collider).
export function wedge(x0, x1, y0, z0, z1, h) {
  const p = [
    x0, y0, z0, x1, y0, z0, // 0 1: low edge
    x0, y0 + h, z1, x1, y0 + h, z1, // 2 3: lip top
    x0, y0, z1, x1, y0, z1, // 4 5: lip bottom
  ]
  const idx = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 0, 2, 4, 1, 5, 3, 0, 4, 5, 0, 5, 1]
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
  geo.setIndex(idx)
  const flat = geo.toNonIndexed()
  flat.computeVertexNormals()
  return { geometry: flat, positions: p, indices: idx }
}

// Seeded random helpers per module.
export function rng(rand) {
  const R = (a, b) => a + rand() * (b - a)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  return { R, pick }
}

// Hides every particle emitter added to `pools` by `build()` while `isActive()` is false (a world
// you are not in costs no particles).
export function gateEmitters(pools, isActive, build) {
  const before = new Map(Object.values(pools).map((p) => [p, p.emitters.length]))
  const out = build()
  for (const [pool, n] of before) {
    for (const e of pool.emitters.slice(n)) {
      const own = e.active
      e.active = own ? () => isActive() && own() : isActive
    }
  }
  return out
}
