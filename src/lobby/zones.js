import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,

  PointLight,
  QuadraticBezierCurve3,

  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { BIKES, EGGS, FEATURED_BIKES, LOBBY, TREADMILLS } from '../config.js'
import { label, neon, solidBox, std } from '../propkit.js'
import { studMat } from './materials.js'
import { fireParticle, glowRing, rnd, sparkleParticle } from './fx.js'
import { buildBike } from './bikes.js'
import { buildEgg } from './pets.js'
import { net } from '../net.js'
import { showRewardedAd } from '../bloxity.js'
import { adReadyIn, claimAdReward } from '../game/state.js'
import { buildChest, buildLeaderboard, buildPedestal, buildTreadmill } from './props.js'
import {
  bikeUnlocked,
  buyFeaturedBike,
  chestReadyIn,
  claimChest,
  equipBike,
  fmt,
  state,
  toast,
  treadmillLabel,
  treadmillUnlocked,
} from '../game/state.js'

// The four zones round the hub. Each builder adds its props to `root`, its
// particle emitters to the shared pools and returns { update(dt, t), triggers }.
// A trigger is { test(x, z) -> bool, prompt() -> { text, action } | null,
// afk?: () => mult, enter?() }: main.js checks the player against them.

const ISLAND = 0.2
const fmtInt = (n) => n.toLocaleString('en-US')

function put(parent, obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z)
  obj.rotation.y = ry
  parent.add(obj)
  return obj
}
const near = (cx, cz, r) => (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < r * r
const inRect = (minX, maxX, minZ, maxZ) => (x, z) => x > minX && x < maxX && z > minZ && z < maxZ

// Text sign: several outlined lines stacked, each its own sprite (own colour/size).
function sign(parent, x, y, z, lines) {
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

// Shared dynamic canvas sprite (timers, boulder status).
function textSprite(height) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  s.scale.set(height * 4, height, 1)
  let last = ''
  s.userData.set = (text, color = '#ffffff', outline = '#14112b') => {
    if (text === last) return
    last = text
    const g = c.getContext('2d')
    g.clearRect(0, 0, 512, 128)
    g.font = '700 84px Fredoka, "Arial Black", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.lineWidth = 16
    g.strokeStyle = outline
    g.strokeText(text, 256, 68)
    g.fillStyle = color
    g.fillText(text, 256, 68)
    tex.needsUpdate = true
  }
  return s
}

// =============================================================================
// NORTH: start pad surroundings — featured bikes, World 2 portal, boulder sign
// =============================================================================
function swirlMaterial(colorA, colorB) {
  return new ShaderMaterial({
    uniforms: { t: { value: 0 }, a: { value: new Color(colorA) }, b: { value: new Color(colorB) } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float t; uniform vec3 a; uniform vec3 b; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ang = atan(p.y, p.x);
        float s = sin(ang * 3.0 + r * 9.0 - t * 3.0) * 0.5 + 0.5;
        float s2 = sin(ang * 5.0 - r * 14.0 + t * 2.2) * 0.5 + 0.5;
        vec3 col = mix(a, b, s * 0.7 + s2 * 0.3) * (1.6 + (1.0 - r) * 2.2);
        float alpha = smoothstep(1.0, 0.82, r) * (0.75 + 0.25 * s);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

function buildPortal(root, pools, x, z, ry) {
  const g = put(root, new Group(), x, ISLAND, z, ry)
  // round dirt base with a grassy rim
  const base = new Mesh(new CylinderGeometry(4.6, 5, 0.6, 28), studMat('#9c5a2e', { roughness: 0.85 }))
  base.position.y = 0.3
  base.receiveShadow = base.castShadow = true
  const rim = new Mesh(new TorusGeometry(4.7, 0.22, 6, 28), studMat('#7fd43a'))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.6
  g.add(base, rim)
  // stone shards in a ring (portal faces local +X)
  const stone = studMat('#9a9aa2', { roughness: 0.9, tile: 1.5 })
  const moss = studMat('#86e534')
  const n = 11
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.15
    const h = 2.2 + Math.abs(Math.sin(i * 2.3)) * 1.8
    const shard = new Mesh(new BoxGeometry(1.3, h, 1.1), stone)
    const r = 3.7
    shard.position.set(0, 3.9 + Math.sin(a) * r, Math.cos(a) * r)
    shard.rotation.x = -a + Math.PI / 2 + (Math.sin(i * 5.1) * 0.25)
    shard.rotation.y = Math.sin(i * 3.7) * 0.3
    shard.castShadow = true
    g.add(shard)
    if (i % 3 === 0) {
      const m = new Mesh(new BoxGeometry(1.35, 0.3, 1.15), moss)
      m.position.y = h / 2
      shard.add(m)
    }
  }
  const swirl = swirlMaterial('#38ff6a', '#d6ff4a')
  const disc = new Mesh(new CircleGeometry(3.3, 48), swirl)
  disc.rotation.y = Math.PI / 2
  disc.position.y = 3.9
  g.add(disc)
  const glow = new PointLight('#5dff6a', 18, 16, 2)
  glow.position.set(1.5, 3.9, 0)
  g.add(glow)
  sign(g, 0, 10.2, 0, [
    { text: 'WORLD 2', size: 2.4, color: '#5dff4a' },
    { text: 'Lvl. 75 Required', size: 1.25, color: '#ffd21f' },
  ])
  solidBox(0.6, 3, 4.2, x, 3, z, ry)
  pools.glow.addEmitter({
    rate: 14,
    make: () => {
      const a = rnd(0, Math.PI * 2)
      const r = rnd(0, 3)
      const c = Math.cos(ry)
      const s = Math.sin(ry)
      const lz = Math.cos(a) * r
      return { ...sparkleParticle(x + s * lz + c * rnd(0, 1.2), ISLAND + 3.9 + Math.sin(a) * r, z + c * lz - s * rnd(0, 1.2), '#5dff6a', 0.2), vx: c * rnd(0.5, 1.4), vz: -s * rnd(0.5, 1.4) }
    },
  })
  return {
    update(dt, t) {
      swirl.uniforms.t.value = t
    },
    trigger: {
      test: near(x, z, 5.5),
      prompt: () => ({ text: 'World 2 (Level 75)', action: () => toast(state.level >= 75 ? 'World 2 opens in the next update!' : `Reach level 75 to enter World 2 (you are ${state.level})`, state.level >= 75 ? 'good' : 'error') }),
    },
  }
}

function buildFeatured(root, pools, def, x, z, ry) {
  const g = put(root, new Group(), x, ISLAND, z, 0)
  const ring = glowRing(def.ring, 3.2, 3.5)
  g.add(ring)
  const turntable = new Group()
  turntable.position.y = 0.55
  g.add(turntable)
  const bike = buildBike(def)
  bike.scale.setScalar(1.25)
  turntable.add(bike)
  turntable.rotation.y = ry
  const lines =
    def.style === 'flame'
      ? [
          { text: def.name, size: 2, color: '#ff8a1f' },
          { text: def.tag, size: 1.7, color: '#ffd21f' },
          { text: `${fmtInt(def.sold)} / ${fmtInt(def.stock)} SOLD`, size: 0.95, color: '#ffb020' },
          { text: `🏆 ${fmtInt(def.wins)}`, size: 1.2, color: '#ffd21f' },
        ]
      : [
          { text: def.tag, size: 1.9, color: '#ffd21f' },
          { text: def.name, size: 1.7, color: '#38e1ff' },
          { text: `🏆 ${fmtInt(def.wins)}`, size: 1.2, color: '#ffd21f' },
        ]
  sign(g, 0, 9, 0, lines)
  const light = new PointLight(def.ring, 14, 12, 2)
  light.position.y = 2
  g.add(light)
  if (def.style === 'flame') {
    pools.fire.addEmitter({
      rate: 70,
      make: () => {
        const a = rnd(0, Math.PI * 2)
        return fireParticle(x + Math.cos(a) * 3.2, ISLAND + 0.2, z + Math.sin(a) * 3.2, 0.9)
      },
    })
    pools.fire.addEmitter({ rate: 30, make: () => fireParticle(x + rnd(-1, 1), ISLAND + 1.4, z + rnd(-1, 1), 0.6) })
  } else {
    pools.glow.addEmitter({ rate: 18, make: () => sparkleParticle(x, ISLAND + 0.6, z, def.ring, 2.6) })
  }
  return {
    update(dt, t) {
      ring.userData.update(t)
      turntable.rotation.y += dt * 0.45
      bike.position.y = Math.sin(t * 1.6) * 0.12
      light.intensity = 12 + Math.sin(t * 9) * 2 + Math.sin(t * 23) * 1.5
    },
    trigger: {
      test: near(x, z, 3.6),
      prompt: () =>
        state.ownedBikes.includes(def.id)
          ? state.bike === def.id
            ? null
            : { text: `Ride ${def.name}`, action: () => equipBike(def.id) }
          : { text: `Buy ${def.name} (🏆 ${fmtInt(def.wins)})`, action: () => buyFeaturedBike(def.id) },
    },
  }
}

const BOULDER_MODES = [
  { mode: 'SLOW', face: '🙂', color: '#7fd6ff', time: 20 },
  { mode: 'MEDIUM', face: '😤', color: '#ffb020', time: 15 },
  { mode: 'FAST', face: '😱', color: '#ff3d3d', time: 10 },
]
function buildNorth(root, pools) {
  const parts = [
    buildFeatured(root, pools, FEATURED_BIKES[0], -27, -52, 0.6),
    buildFeatured(root, pools, FEATURED_BIKES[1], 27, -52, -0.6),
    buildPortal(root, pools, -46, -50, 0),
  ]
  // Boulder speed cycles SLOW -> MEDIUM -> FAST (the HUD shows it; the lane will use it).
  let mode = 0
  let timer = BOULDER_MODES[0].time
  return {
    boulder: () => BOULDER_MODES[mode].mode,
    update(dt, t) {
      for (const p of parts) p.update(dt, t)
      timer -= dt
      if (timer <= 0) {
        mode = (mode + 1) % BOULDER_MODES.length
        timer = BOULDER_MODES[mode].time
      }
    },
    triggers: parts.map((p) => p.trigger),
  }
}

// =============================================================================
// WEST: bike garage — two stepped tiers of unlock pads
// =============================================================================
function buildGarage(root) {
  const G = LOBBY.garage
  const deck = studMat('#d6d8e0', { roughness: 0.55 })
  const edge = studMat('#9da2b5', { roughness: 0.6 })
  const g = new Group()
  root.add(g)
  // Lower tier (front, east) and upper tier (back, west).
  const tiers = [
    { minX: -56, maxX: G.maxX, h: 0.4 },
    { minX: G.minX, maxX: -56, h: 0.8 },
  ]
  for (const t of tiers) {
    const w = t.maxX - t.minX
    const d = G.maxZ - G.minZ - 2
    const m = new Mesh(new BoxGeometry(w, t.h, d), deck)
    m.position.set((t.minX + t.maxX) / 2, t.h / 2, 0)
    m.receiveShadow = m.castShadow = true
    g.add(m)
    const lip = new Mesh(new BoxGeometry(0.5, t.h + 0.04, d + 0.04), edge)
    lip.position.set(t.maxX - 0.25, (t.h + 0.04) / 2, 0)
    g.add(lip)
    solidBox(w / 2, t.h / 2, d / 2, (t.minX + t.maxX) / 2, t.h / 2, 0)
  }
  // End caps (sloped look): darker side strips.
  for (const sz of [-1, 1]) {
    const cap = new Mesh(new BoxGeometry(G.maxX - G.minX, 0.9, 0.6), edge)
    cap.position.set((G.minX + G.maxX) / 2, 0.45, sz * (G.maxZ - 1.3))
    cap.castShadow = true
    g.add(cap)
  }

  const padGeo = new BoxGeometry(4, 0.14, 4)
  const padMats = { equipped: studMat('#3ddc3d', { emissive: '#3ddc3d', emissiveIntensity: 0.25 }), open: studMat('#ffd21f', { emissive: '#ffd21f', emissiveIntensity: 0.2 }), locked: studMat('#e8262e', { emissive: '#e8262e', emissiveIntensity: 0.15 }) }
  const slots = []
  const zs = [-16, -8, 0, 8, 16]
  BIKES.forEach((def, i) => {
    const row = i < 5 ? 0 : 1
    const x = row === 0 ? -49.5 : -61.5
    const y = tiers[row].h
    const z = zs[i % 5] * (row === 0 ? 1 : 1)
    const pad = new Mesh(padGeo, padMats.locked)
    pad.position.set(x, y + 0.07, z)
    pad.receiveShadow = true
    g.add(pad)
    const bike = buildBike(def)
    bike.scale.setScalar(1.3)
    bike.position.set(x - (row === 0 ? 0.4 : 0), y + 0.14, z)
    bike.rotation.y = Math.PI / 2 + 0.5
    g.add(bike)
    sign(g, x + (row === 0 ? 2.2 : 1.2), y + (row === 0 ? 3 : 5.2), z, [
      { text: `+${fmt(def.perSpeed)}/Speed`, size: 1.15, color: '#ffffff' },
      { text: `🏆 ${fmt(def.wins)} Wins`, size: 1.15, color: '#ffd21f' },
    ])
    slots.push({ def, pad, bike, x, z })
  })
  sign(g, -56, 12, 0, [
    { text: 'BIKE GARAGE', size: 4.6, color: '#ffc21f' },
    { text: 'Collect wins to unlock faster bikes!', size: 1.7, color: '#ffffff' },
  ])

  let lastKey = ''
  const refresh = () => {
    const key = `${state.bike}|${state.wins}|${state.ownedBikes.length}`
    if (key === lastKey) return
    lastKey = key
    for (const s of slots) s.pad.material = state.bike === s.def.id ? padMats.equipped : bikeUnlocked(s.def) ? padMats.open : padMats.locked
  }
  return {
    update(dt, t) {
      refresh()
      for (const s of slots) s.bike.rotation.y = Math.PI / 2 + 0.5 + Math.sin(t * 0.6 + s.z) * 0.25
    },
    triggers: slots.map((s) => ({
      test: inRect(s.x - 2.4, s.x + 2.4, s.z - 2.4, s.z + 2.4),
      prompt: () =>
        state.bike === s.def.id
          ? null
          : bikeUnlocked(s.def)
            ? { text: `Equip ${s.def.name}`, action: () => equipBike(s.def.id) }
            : { text: `${s.def.name}: needs ${fmt(s.def.wins)} Wins`, action: () => equipBike(s.def.id) },
    })),
  }
}

// "Next update" billboard with a ??? screen.
function buildUpdateBoard(root, x, z, ry) {
  const g = put(root, new Group(), x, ISLAND, z, ry)
  const post = studMat('#6b4a3a')
  for (const sx of [-3.4, 3.4]) {
    const p = new Mesh(new BoxGeometry(0.6, 6, 0.6), post)
    p.position.set(sx, 3, 0)
    p.castShadow = true
    g.add(p)
  }
  const board = new Mesh(new BoxGeometry(7.4, 3.6, 0.4), std('#121218', { roughness: 0.4 }))
  board.position.set(0, 3.8, 0)
  board.castShadow = true
  g.add(board)
  const q = label('???', 2.4, { color: '#ffffff', outline: '#000000' })
  q.position.set(0, 3.8, 0.4)
  g.add(q)
  sign(g, 0, 8.6, 0, [
    { text: 'New Update', size: 1.7, color: '#4dff4a' },
    { text: 'Coming soon!', size: 0.9, color: '#ffffff' },
  ])
  solidBox(3.8, 3, 0.4, x, 3, z, ry)
}

// =============================================================================
// SOUTH: pet hatchery — egg pedestals in a sunken court + leaderboards
// =============================================================================
const FAKE = ['TurboTom', 'NovaRider', 'PixelPaws', 'ZoomQueen', 'MegaMoto', 'SkidKid', 'Blazey', 'RevRaccoon', 'GearGoblin', 'HillHopper', 'DriftDuck', 'NitroNat']
function fakeRows(seed, scale) {
  return FAKE.map((name, i) => ({ name: FAKE[(i + seed) % FAKE.length], value: Math.round(scale / Math.pow(1.6, i) * (1 + ((i * 7 + seed) % 5) * 0.05)) }))
}
function boardRows(kind) {
  const live = net.leaderboard?.boards?.[kind]
  if (live) {
    return live.map((r) => ({ name: r.name, value: kind === "played" ? fmt(Math.round(r.value / 60)) + " min" : fmt(r.value) })).map((r) => ({ name: `@${r.name}`, value: r.value }))
  }
  const you = { name: 'You', value: kind === 'wins' ? state.wins : kind === 'speed' ? state.speed : Math.round(state.played / 60) }
  const base = kind === 'wins' ? fakeRows(1, 1.2e9) : kind === 'speed' ? fakeRows(4, 8e12) : fakeRows(7, 52000)
  const rows = [...base, you].sort((a, b) => b.value - a.value).slice(0, 10)
  return rows.map((r) => ({ name: r.name === 'You' ? '⭐ You' : `@${r.name}`, value: kind === 'played' ? `${fmt(r.value)} min` : fmt(r.value) }))
}

function buildHatchery(root) {
  const H = LOBBY.hatchery
  const g = new Group()
  root.add(g)
  const rimH = 0.35
  const court = { minX: -15, maxX: 15, minZ: 50, maxZ: 66 }
  const w = court.maxX - court.minX
  const d = court.maxZ - court.minZ
  const rim = new Mesh(new BoxGeometry(w, rimH, d), studMat('#dfe1e8'))
  rim.position.set(0, rimH / 2, (court.minZ + court.maxZ) / 2)
  rim.receiveShadow = rim.castShadow = true
  const pit = new Mesh(new BoxGeometry(w - 3, 0.04, d - 3), studMat('#3a4170', { roughness: 0.6 }))
  pit.position.set(0, rimH + 0.01, (court.minZ + court.maxZ) / 2)
  pit.receiveShadow = true
  g.add(rim, pit)
  solidBox(w / 2, rimH / 2, d / 2, 0, rimH / 2, (court.minZ + court.maxZ) / 2)

  const eggs = []
  EGGS.forEach((def, i) => {
    const x = (i - 1) * 9
    const z = i === 1 ? 60 : 57
    const ped = buildPedestal(def.label)
    ped.position.set(x, rimH, z)
    g.add(ped)
    solidBox(1.5, 0.5, 1.5, x, rimH + 0.3, z)
    const egg = buildEgg(def)
    egg.position.set(x, rimH + 0.9, z)
    g.add(egg)
    sign(g, x, rimH + 6, z, [
      { text: def.tier || '', size: 1.4, color: def.label },
      { text: def.name, size: 1.4, color: '#ffffff' },
      { text: `🏆 ${fmt(def.cost)}`, size: 1.05, color: '#ffd21f' },
    ])
    eggs.push({ def, egg, x, z })
  })
  sign(g, 0, 14, 70, [
    { text: 'PET HATCHERY', size: 4.6, color: '#ff3dc8' },
    { text: 'Unlock Pets to boost your Training!', size: 1.7, color: '#ffffff' },
  ])

  const boards = [
    { kind: 'wins', title: '🏆 Top Wins', accent: '#ffb020', x: -25, z: 60, ry: Math.PI - 0.5 },
    { kind: 'speed', title: '⚡ Top Speed', accent: '#38b6ff', x: 25, z: 60, ry: Math.PI + 0.5 },
    { kind: 'played', title: '⏱ Most Played', accent: '#ff3d8b', x: 52, z: 44, ry: -2.36 },
  ].map((b) => {
    const m = buildLeaderboard(b.title, boardRows(b.kind), b.accent)
    put(root, m, b.x, ISLAND, b.z, b.ry)
    solidBox(3.6, 5, 1, b.x, 5, b.z, b.ry)
    return { ...b, m }
  })
  let boardTimer = 0
  return {
    update(dt, t) {
      for (const e of eggs) {
        e.egg.position.y = rimH + 0.9 + Math.sin(t * 1.8 + e.x) * 0.18
        e.egg.rotation.y = t * 0.5 + e.x
      }
      boardTimer -= dt
      if (boardTimer <= 0) {
        boardTimer = 5
        for (const b of boards) b.m.userData.redraw?.(boardRows(b.kind))
      }
    },
    triggers: eggs.map((e) => ({
      test: near(e.x, e.z, 3.4),
      prompt: () => ({ egg: e.def.id }), // the HUD shows the egg popup (hud/eggs.js) instead of a text prompt
    })),
  }
}

// =============================================================================
// EAST: AFK zone — treadmills, the black-hole vortex, free reward chest
// =============================================================================
function fireTubeMaterial() {
  return new ShaderMaterial({
    uniforms: { t: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float t; varying vec2 vUv;
      void main(){
        float flow = sin(vUv.x * 40.0 - t * 9.0) * 0.5 + 0.5;
        float flick = sin(vUv.x * 13.0 + vUv.y * 6.28 + t * 5.0) * 0.5 + 0.5;
        float edge = sin(vUv.y * 3.14159);
        vec3 col = mix(vec3(2.2, 0.35, 0.02), vec3(3.2, 2.2, 0.6), flow * flick);
        float a = edge * (0.45 + 0.55 * flow) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        gl_FragColor = vec4(col * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}
function discMaterial() {
  return new ShaderMaterial({
    uniforms: { t: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float t; varying vec3 vP;
      void main(){
        float r = length(vP.xy); float ang = atan(vP.y, vP.x);
        float n = (r - 2.6) / 5.0;
        float bands = sin(ang * 4.0 + r * 3.0 - t * 4.0) * 0.5 + 0.5;
        float bands2 = sin(ang * 9.0 - r * 5.0 - t * 6.5) * 0.5 + 0.5;
        vec3 hot = vec3(3.4, 2.4, 0.8); vec3 mid = vec3(2.6, 0.55, 0.05); vec3 cold = vec3(0.9, 0.05, 0.02);
        vec3 col = mix(hot, mid, smoothstep(0.0, 0.35, n));
        col = mix(col, cold, smoothstep(0.35, 1.0, n));
        float a = (1.0 - smoothstep(0.55, 1.0, n)) * (0.55 + 0.45 * bands) * (0.7 + 0.3 * bands2);
        gl_FragColor = vec4(col * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

function buildVortex(root, pools, x, y, z, padX, padZ, padW, padL) {
  const g = put(root, new Group(), x, y, z)
  const core = new Mesh(new SphereGeometry(2.3, 32, 16), new MeshBasicMaterial({ color: '#000000' }))
  const halo = new Mesh(new TorusGeometry(2.45, 0.16, 10, 64), neon('#ff5a1a', 4))
  const disc = new Mesh(new RingGeometry(2.4, 7.8, 96, 1), discMaterial())
  const tilt = new Group()
  tilt.rotation.x = Math.PI / 2 - 0.32
  tilt.rotation.z = 0.25
  tilt.add(disc)
  halo.rotation.x = 0.1
  g.add(core, halo, tilt)
  const light = new PointLight('#ff6a1a', 60, 40, 1.6)
  g.add(light)
  // Fire arcs pouring down onto the treadmill corners.
  const tubeMat = fireTubeMaterial()
  const curves = []
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const end = new Vector3(padX + (cx * padW) / 2 - x, ISLAND + 0.6 - y, padZ + (cz * padL) / 2 - z)
    const start = new Vector3(cx * 3, -0.5, cz * 2.5)
    const mid = new Vector3(cx * 7.5, end.y * 0.35, cz * 6)
    const curve = new QuadraticBezierCurve3(start, mid, end)
    curves.push(curve)
    g.add(new Mesh(new TubeGeometry(curve, 48, 0.32, 8, false), tubeMat))
  }
  const dm = disc.material
  const p = new Vector3()
  pools.fire.addEmitter({
    rate: 60,
    make: () => {
      curves[Math.floor(Math.random() * curves.length)].getPoint(Math.random(), p)
      return fireParticle(x + p.x, y + p.y, z + p.z, 0.55)
    },
  })
  pools.fire.addEmitter({
    rate: 30,
    make: () => {
      const a = rnd(0, Math.PI * 2)
      const r = rnd(2.6, 6)
      const lp = new Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyEuler(tilt.rotation)
      return { ...fireParticle(x + lp.x, y + lp.y, z + lp.z, 0.5), vy: rnd(-0.3, 0.6) }
    },
  })
  return (dt, t) => {
    dm.uniforms.t.value = t
    tubeMat.uniforms.t.value = t
    disc.rotation.z -= dt * 0.6
    core.scale.setScalar(1 + Math.sin(t * 3) * 0.03)
    light.intensity = 55 + Math.sin(t * 7) * 8
  }
}

function clockSprite(size) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#ff2f6d'
  g.beginPath()
  g.arc(64, 64, 60, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(64, 64, 42, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#1b1530'
  g.lineCap = 'round'
  g.lineWidth = 9
  g.beginPath()
  g.moveTo(64, 64)
  g.lineTo(64, 34)
  g.moveTo(64, 64)
  g.lineTo(86, 74)
  g.stroke()
  g.fillStyle = '#ff2f6d'
  g.beginPath()
  g.arc(64, 64, 7, 0, Math.PI * 2)
  g.fill()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  s.scale.setScalar(size)
  return s
}

const MILL_SIZE = { undefined: [3.2, 5], lg: [4.4, 6.5], xl: [6, 8] }
function buildAfk(root, pools, npcSpots) {
  const g = new Group()
  root.add(g)
  const cx = 56
  const gap = 0.7
  const widths = TREADMILLS.map((t) => MILL_SIZE[t.size][0])
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)
  let z = -total / 2
  const mills = []
  let vortexUpdate = null
  TREADMILLS.forEach((def, i) => {
    const [w, l] = MILL_SIZE[def.size]
    const mz = z + w / 2
    z += w + gap
    const m = buildTreadmill(def)
    put(g, m, cx, 0, mz, -Math.PI / 2)
    const h = m.userData.size?.h ?? 0.4
    // deck the bike rides onto
    solidBox(l / 2, h / 2, w / 2 - 0.1, cx, h / 2, mz)
    const lines = [{ text: `${def.mult}x Speed`, size: def.size ? 1.8 : 1.35, color: def.size === 'xl' ? '#ff8a1f' : def.mult >= 25 ? '#ff4dff' : def.mult >= 9 ? '#38e1ff' : '#ffd21f' }]
    lines.push(def.req ? { text: `🔒 ${treadmillLabel(def)}`, size: 0.85, color: '#ff8ad6' } : { text: '0 Rebirths', size: 0.85, color: '#9fe8ff' })
    sign(g, cx + 1.5, (def.size === 'xl' ? 7 : 4.6) + h, mz, lines)
    if (def.glow) pools.glow.addEmitter({ rate: 8, make: () => sparkleParticle(cx, h + 0.4, mz, def.color, w / 2) })
    if (def.vortex) vortexUpdate = buildVortex(root, pools, cx - 1, 15, mz - 2, cx, mz, l, w)
    mills.push({ def, m, w, l, x: cx, z: mz, h })
  })
  // Two idle riders training on 1x treadmills.
  const ones = mills.filter((m) => m.def.mult === 1)
  npcSpots.push({ x: ones[0].x, y: ones[0].h, z: ones[0].z, facing: Math.PI / 2, name: 'NovaRider', bike: BIKES[1] })
  npcSpots.push({ x: ones[1].x, y: ones[1].h, z: ones[1].z, facing: Math.PI / 2, name: 'PixelPaws', bike: BIKES[0] })

  const header = sign(g, 66, 13, 0, [
    { text: 'AFK ZONE', size: 4.8, color: '#ffc21f' },
    { text: 'Train while not moving!', size: 1.8, color: '#ffffff' },
  ])
  for (const sz of [-1, 1]) {
    const c = clockSprite(4.4)
    c.position.set(0, 0.1, sz * 13)
    header.add(c)
  }

  // Free rewards chest.
  let adBusy = false
  async function watchChestAd() {
    if (adBusy || adReadyIn() > 0) return
    adBusy = true
    try {
      const status = await showRewardedAd('chest-bonus')
      if (status === 'completed') claimAdReward()
      else if (status === 'disabled') toast('Ads are not available here', 'error')
      else toast('No reward: the ad was not finished', 'info')
    } finally {
      adBusy = false
    }
  }
  const chest = buildChest()
  put(root, chest, 50, ISLAND, 33, -0.6)
  solidBox(1.3, 0.9, 1, 50, 0.9, 33, -0.6)
  const chestRing = glowRing('#38c8ff', 2.6, 2.4)
  put(root, chestRing, 50, ISLAND + 0.01, 33)
  const chestLabel = sign(root, 50, 5.4, 33, [{ text: 'FREE REWARDS!', size: 1.1, color: '#ff9a1f' }])
  const chestTimer = textSprite(0.9)
  chestTimer.position.set(0, -1.1, 0)
  chestLabel.add(chestTimer)
  pools.glow.addEmitter({ rate: 10, active: () => chestReadyIn() === 0, make: () => sparkleParticle(50, ISLAND + 0.5, 33, '#7fe0ff', 2) })

  return {
    update(dt, t) {
      for (const m of mills) {
        const tex = m.m.userData.beltTexture
        if (tex) tex.offset.y += dt * (m.def.mult >= 9 ? 1.4 : 0.8)
      }
      vortexUpdate?.(dt, t)
      chestRing.userData.update(t)
      const left = chestReadyIn()
      chestTimer.userData.set(left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : 'READY!', left > 0 ? '#ffffff' : '#8ef03c')
      const lid = chest.userData.lid
      if (lid) lid.rotation.x += ((left > 0 ? 0 : -1.3 - Math.sin(t * 3) * 0.12) - lid.rotation.x) * Math.min(1, dt * 6)
      chestRing.visible = left === 0
    },
    triggers: [
      ...mills.map((m) => ({
        test: inRect(m.x - m.l / 2, m.x + m.l / 2, m.z - m.w / 2 + 0.2, m.z + m.w / 2 - 0.2),
        afk: () => (treadmillUnlocked(m.def) ? m.def.mult : 0),
        enter: () => {
          if (!treadmillUnlocked(m.def)) toast(`${m.def.mult}x treadmill needs ${treadmillLabel(m.def)}`, 'error')
        },
        prompt: () => null,
      })),
      {
        test: near(50, 33, 3.6),
        // Watching a Bloxity rewarded ad earns a small bonus (Wins + Speed), every few minutes.
        prompt: () => {
          if (adBusy || adReadyIn() > 0) return null
          return { text: 'Watch an ad for a bonus reward', action: watchChestAd }
        },
        enter: () => {
          if (!claimChest()) {
            const left = chestReadyIn()
            toast(`Free rewards in ${Math.floor(left / 60)}m ${Math.floor(left % 60)}s`, 'info')
          }
        },
      },
    ],
  }
}

// =============================================================================
export function buildZones(scene, pools) {
  const root = new Group()
  root.name = 'zones'
  scene.add(root)
  const npcSpots = []
  const north = buildNorth(root, pools)
  const zones = [north, buildGarage(root), buildHatchery(root), buildAfk(root, pools, npcSpots)]
  buildUpdateBoard(root, -30, 32, 0.9)
  return {
    npcSpots,
    boulder: north.boulder,
    triggers: zones.flatMap((z) => z.triggers),
    update(dt, t) {
      for (const z of zones) z.update(dt, t)
    },
  }
}
