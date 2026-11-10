import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'
import { paintSoftDot, paintSparkle } from '../textures.js'
import { neon } from '../propkit.js'

// Effects: a CPU particle system (one Points draw per pool, per-particle colour,
// alpha and size, HDR colours so fire and sparkles bloom) and the glowing
// ring + light-beam pedestal used under featured items.

let quality = 1 // GRAPHICS_PRESETS.particles: scales every emitter's rate
export function setParticleQuality(q) {
  quality = q
}
let pointScale = 600
export function setPointScale(viewportHeight, fovDeg) {
  pointScale = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360))
  for (const p of pools) p.material.uniforms.uScale.value = pointScale
}

const texCache = {}
function tex(kind) {
  if (texCache[kind]) return texCache[kind]
  const t = new CanvasTexture(kind === 'sparkle' ? paintSparkle(64) : paintSoftDot(64))
  t.colorSpace = SRGBColorSpace
  return (texCache[kind] = t)
}

const VERT = `
attribute vec4 aColor;
attribute float aSize;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
uniform sampler2D map;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float a = vColor.a * t.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const pools = new Set()
// A fixed-capacity pool of particles drawn as one Points object.
export class ParticlePool {
  constructor(scene, { capacity = 400, texture = 'dot', additive = true } = {}) {
    this.cap = capacity
    this.count = 0
    const g = new BufferGeometry()
    this.pos = new Float32Array(capacity * 3)
    this.col = new Float32Array(capacity * 4)
    this.size = new Float32Array(capacity)
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('aColor', new BufferAttribute(this.col, 4))
    g.setAttribute('aSize', new BufferAttribute(this.size, 1))
    this.geometry = g
    this.material = new ShaderMaterial({
      uniforms: { map: { value: tex(texture) }, uScale: { value: pointScale } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    // per particle: vx vy vz life maxLife c0(rgba) c1(rgba) s0 s1 gravity drag spin
    this.data = new Float32Array(capacity * 18)
    this.emitters = []
    pools.add(this)
  }

  // o: { x,y,z, vx,vy,vz, life, c0:[r,g,b,a], c1:[r,g,b,a], s0, s1, gravity, drag }
  spawn(o) {
    if (this.count >= this.cap) return
    const i = this.count++
    const d = this.data
    const k = i * 18
    this.pos[i * 3] = o.x
    this.pos[i * 3 + 1] = o.y
    this.pos[i * 3 + 2] = o.z
    d[k] = o.vx || 0
    d[k + 1] = o.vy || 0
    d[k + 2] = o.vz || 0
    d[k + 3] = 0
    d[k + 4] = o.life || 1
    d.set(o.c0, k + 5)
    d.set(o.c1 || o.c0, k + 9)
    d[k + 13] = o.s0 ?? 0.5
    d[k + 14] = o.s1 ?? o.s0 ?? 0.5
    d[k + 15] = o.gravity || 0
    d[k + 16] = o.drag || 0
    d[k + 17] = o.wobble || 0
  }

  // emitter: { rate (per s), make: () => spawn options, active?: () => bool }
  addEmitter(e) {
    e.acc = 0
    this.emitters.push(e)
    return e
  }

  update(dt, t) {
    for (const e of this.emitters) {
      if (e.active && !e.active()) continue
      e.acc += e.rate * quality * dt
      while (e.acc >= 1) {
        e.acc -= 1
        this.spawn(e.make(t))
      }
    }
    const d = this.data
    let i = 0
    while (i < this.count) {
      const k = i * 18
      d[k + 3] += dt
      const life = d[k + 3] / d[k + 4]
      if (life >= 1) {
        // swap-remove with the last particle
        const last = this.count - 1
        if (i !== last) {
          this.pos.copyWithin(i * 3, last * 3, last * 3 + 3)
          d.copyWithin(k, last * 18, last * 18 + 18)
        }
        this.count--
        continue
      }
      const drag = Math.max(0, 1 - d[k + 16] * dt)
      d[k] *= drag
      d[k + 1] = d[k + 1] * drag + d[k + 15] * dt
      d[k + 2] *= drag
      const w = d[k + 17]
      const wob = w ? Math.sin(t * 9 + i * 1.7) * w * dt : 0
      this.pos[i * 3] += d[k] * dt + wob
      this.pos[i * 3 + 1] += d[k + 1] * dt
      this.pos[i * 3 + 2] += d[k + 2] * dt + wob
      for (let c = 0; c < 4; c++) this.col[i * 4 + c] = d[k + 5 + c] + (d[k + 9 + c] - d[k + 5 + c]) * life
      // fade in fast, out at the end
      this.col[i * 4 + 3] *= Math.min(1, life * 8)
      this.size[i] = d[k + 13] + (d[k + 14] - d[k + 13]) * life
      i++
    }
    this.geometry.setDrawRange(0, this.count)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aColor.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
  }
}

// HDR colour helper: '#ffaa00' x k -> [r,g,b,a]
export function hdr(hex, k = 1, a = 1) {
  const c = new Color(hex)
  return [c.r * k, c.g * k, c.b * k, a]
}
export const rnd = (a, b) => a + Math.random() * (b - a)

// Standard looks.
export function fireParticle(x, y, z, scale = 1) {
  return {
    x: x + rnd(-0.3, 0.3) * scale,
    y,
    z: z + rnd(-0.3, 0.3) * scale,
    vx: rnd(-0.4, 0.4) * scale,
    vy: rnd(1.8, 3.6) * scale,
    vz: rnd(-0.4, 0.4) * scale,
    life: rnd(0.5, 1.0),
    c0: [3.2, 2.4, 0.9, 1],
    c1: [1.6, 0.25, 0.02, 0],
    s0: 0.9 * scale,
    s1: 0.25 * scale,
    drag: 0.6,
    wobble: 0.8 * scale,
  }
}
export function sparkleParticle(x, y, z, hex, spread = 1) {
  return {
    x: x + rnd(-spread, spread),
    y: y + rnd(0, spread * 1.5),
    z: z + rnd(-spread, spread),
    vy: rnd(0.3, 1.2),
    life: rnd(0.8, 1.6),
    c0: hdr(hex, 2.6, 1),
    c1: hdr(hex, 1.5, 0),
    s0: rnd(0.35, 0.7),
    s1: 0.05,
  }
}

// --- Glow ring + beam pedestal -------------------------------------------------------
function beamTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 128, 0, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.22)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function discTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.0)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.25)')
  grad.addColorStop(0.85, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
let beamTex = null
let discTex = null

// A glowing floor ring with a soft light column rising out of it. Returns a
// Group with userData.update(t) for the pulse.
export function glowRing(color, radius = 3, beamHeight = 4) {
  beamTex ||= beamTexture()
  discTex ||= discTexture()
  const g = new Group()
  const ring = new Mesh(new TorusGeometry(radius, 0.16, 8, 64), neon(color, 3))
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.12
  const ring2 = new Mesh(new TorusGeometry(radius * 0.78, 0.07, 6, 48), neon(color, 2.4))
  ring2.rotation.x = Math.PI / 2
  ring2.position.y = 0.1
  const disc = new Mesh(
    new RingGeometry(0.1, radius * 1.15, 48),
    new MeshBasicMaterial({ color, map: discTex, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
  )
  disc.rotation.x = -Math.PI / 2
  disc.position.y = 0.08
  const beam = new Mesh(
    new CylinderGeometry(radius, radius, beamHeight, 40, 1, true),
    new MeshBasicMaterial({ color, map: beamTex, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0.55 }),
  )
  beam.position.y = beamHeight / 2 + 0.1
  g.add(disc, ring, ring2, beam)
  g.userData.update = (t) => {
    const p = 0.75 + Math.sin(t * 2.4) * 0.25
    beam.material.opacity = 0.35 + p * 0.3
    disc.material.opacity = 0.6 + p * 0.4
    ring2.rotation.z = t * 0.8
  }
  return g
}
