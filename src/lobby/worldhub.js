// The hub of World 2 (Jungle) and World 3 (Volcano): the same zones as the World 1 lobby, themed
// per world and with that world's own catalog: egg pedestals (west), treadmills (east), bike unlock
// pads + portals (south), a free chest, a landmark in the middle and the course gate (north).
// Layout: HUB in config (local metres from the world origin). Returns { root, triggers, update }.
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  BoxGeometry,
  CylinderGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { EGGS, HUB, JUNGLE, VOLCANO, WORLD_BIKES, WORLD_CHESTS, WORLD_TREADMILLS, WORLDS } from '../config.js'
import { label, neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'
import { studMat } from './materials.js'
import { fireParticle, glowRing, rnd, sparkleParticle } from './fx.js'
import { buildBike } from './bikes.js'
import { buildEgg } from './pets.js'
import { buildChest, buildPedestal, buildTreadmill } from './props.js'
import { Batch, SIDES, TAU, batchMaterial, boxCollider, lavaMaterial, rng, sign, textSprite, waterMaterial } from './worldkit.js'
import { bikeUnlocked, claimWorldChest, equipBike, fmt, state, toast, travelTo, treadmillLabel, treadmillUnlocked, worldChestReadyIn, worldUnlocked } from '../game/state.js'

const THEMES = {
  w2: {
    floor: '#7a5a34', path: '#a07a48', plaza: '#5fd13a', curb: '#d9c690', cliff: ['#6f7c5a', '#7f8a6a'], cap: ['#4fc23a', '#5fd13a', '#3fa832'],
    title: 'JUNGLE!', course: 'JUNGLE JUMPS', courseSub: 'Jump the gaps · faster = farther!', accent: '#7dff4a',
    eggs: 'PET TEMPLE', mills: 'VINE GYM', bikes: 'JUNGLE GARAGE', portal: ['#38ff6a', '#d6ff4a'], gateW: JUNGLE.halfWidth,
  },
  w3: {
    floor: '#3a3036', path: '#4a3f44', plaza: '#2a1f2a', curb: '#ff7a1f', cliff: ['#3a3036', '#2e262c'], cap: ['#4a3a3a', '#a8401a', '#3a2c2c'],
    title: 'VOLCANO!', course: 'MAGMA RUN', courseSub: 'Outrun the collapsing bridges!', accent: '#ff8a1f',
    eggs: 'EMBER HATCHERY', mills: 'MAGMA MILLS', bikes: 'FORGE GARAGE', portal: ['#ff5a1a', '#ffd21f'], gateW: VOLCANO.outpostHalf,
  },
}
const MILL_SIZE = { undefined: [3.2, 5], lg: [4.4, 6.5], xl: [6, 8] }
const near = (cx, cz, r) => (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < r * r
const inRect = (minX, maxX, minZ, maxZ) => (x, z) => x > minX && x < maxX && z > minZ && z < maxZ

function swirlMaterial(a, b) {
  return new ShaderMaterial({
    uniforms: { t: { value: 0 }, a: { value: new Color(a) }, b: { value: new Color(b) } },
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

function paintTitle(text, color) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 300
  const g = c.getContext('2d')
  g.font = 'italic 700 190px Fredoka, "Arial Black", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = 34
  g.strokeStyle = '#13102a'
  g.strokeText(text, 512, 156)
  g.fillStyle = color
  g.fillText(text, 512, 156)
  return c
}

export function buildWorldHub(scene, pools, worldId, isActive) {
  const T = THEMES[worldId]
  const W = WORLDS.find((w) => w.id === worldId)
  const O = W.origin
  const root = new Group()
  root.name = `hub-${worldId}`
  scene.add(root)
  const X = (x) => O.x + x
  const Z = (z) => O.z + z
  const rand = mulberry32(worldId === 'w2' ? 2202 : 3303)
  const { R, pick } = rng(rand)
  const H = HUB.half
  const updates = []
  const triggers = []

  // --- Ground, plaza, paths, colliders --------------------------------------------------------------
  // (stops at the gate: the course lies north of it)
  const ground = new Mesh(new PlaneGeometry(H.x * 2 + 120, H.z + 60 - HUB.gateZ), studMat(T.floor, { roughness: 0.9 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(X(0), -0.02, Z((HUB.gateZ + H.z + 60) / 2))
  ground.receiveShadow = true
  root.add(ground)
  boxCollider(H.x + 2, 1, H.z + 2, X(0), -1, Z(0))
  {
    const b = new Batch()
    // cross-shaped paths + the round plaza
    b.box(10, 0.06, H.z * 2, T.path, X(0), 0.03, Z(0))
    b.box(H.x * 2 - 8, 0.06, 10, T.path, X(0), 0.03, Z(4))
    b.cyl(15, 0.1, T.curb, X(0), 0.05, Z(0), 0, 0, 0, 28)
    b.cyl(14.3, 0.14, T.plaza, X(0), 0.07, Z(0), 0, 0, 0, 28)
    // curbs round the zones
    for (const [x, z, w, d] of [[-36, 1, 14, 34], [40, 0, 14, 50], [0, 34, 70, 10]]) {
      b.box(w, 0.12, d, T.curb, X(x), 0.06, Z(z))
      b.box(w - 0.8, 0.14, d - 0.8, T.path, X(x), 0.07, Z(z))
    }
    root.add(b.build(batchMaterial(true)))
  }
  // big painted title on the spawn plaza
  {
    const tex = new CanvasTexture(paintTitle(T.title, T.accent))
    tex.colorSpace = SRGBColorSpace
    const decal = new Mesh(new PlaneGeometry(20, 5.9), new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }))
    decal.rotation.x = -Math.PI / 2
    decal.position.set(X(0), 0.16, Z(HUB.spawn.z + 6))
    root.add(decal)
    document.fonts?.load?.('italic 700 190px Fredoka').then(() => {
      tex.image = paintTitle(T.title, T.accent)
      tex.needsUpdate = true
    })
  }
  // walls round the hub (open at the gate)
  const gw = T.gateW
  boxCollider(H.x + 2, 8, 0.6, X(0), 8, Z(H.z + 0.6))
  boxCollider(0.6, 8, H.z + 2, X(-H.x - 0.6), 8, Z(0))
  boxCollider(0.6, 8, H.z + 2, X(H.x + 0.6), 8, Z(0))
  const side = (H.x - gw) / 2
  boxCollider(side, 8, 0.6, X(-(gw + side)), 8, Z(HUB.gateZ - 0.6))
  boxCollider(side, 8, 0.6, X(gw + side), 8, Z(HUB.gateZ - 0.6))

  // --- Cliffs round the hub ---------------------------------------------------------------------
  {
    const CELL = 6
    const cols = []
    for (let k = 0; k < 4; k++) {
      const d = CELL / 2 + k * CELL
      for (let x = -H.x - d; x <= H.x + d + 0.01; x += CELL) {
        cols.push({ x, z: H.z + d, k })
        if (Math.abs(x) > gw + d + 2) cols.push({ x, z: HUB.gateZ - d, k })
      }
      for (let z = HUB.gateZ - d + CELL; z <= H.z + d - CELL + 0.01; z += CELL) {
        cols.push({ x: -H.x - d, z, k })
        cols.push({ x: H.x + d, z, k })
      }
    }
    const box = new BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const m = new Matrix4()
    const q = new Quaternion()
    const tint = new Color()
    const rock = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.85 }), cols.length)
    const caps = new InstancedMesh(box, studMat('#ffffff', { roughness: 0.75 }), cols.length)
    const hs = []
    cols.forEach((c, i) => {
      const h = R(4, 8) + c.k * R(4, 8)
      hs.push(h)
      const y0 = worldId === 'w3' ? -4 : -2
      rock.setMatrixAt(i, m.compose(new Vector3(X(c.x), y0, Z(c.z)), q, new Vector3(CELL + 0.05, h - y0, CELL + 0.05)))
      rock.setColorAt(i, tint.set(T.cliff[c.k % 2]).offsetHSL(0, R(-0.03, 0.03), R(-0.04, 0.04)))
      caps.setMatrixAt(i, m.compose(new Vector3(X(c.x), h, Z(c.z)), q, new Vector3(CELL + 0.3, 0.7, CELL + 0.3)))
      caps.setColorAt(i, tint.set(pick(T.cap)))
    })
    rock.castShadow = rock.receiveShadow = caps.receiveShadow = true
    root.add(rock, caps)
    const decor = new Batch()
    cols.forEach((c, i) => {
      if (rand() > 0.45) return
      const y = hs[i] + 0.35
      const x = X(c.x + R(-1.5, 1.5))
      const z = Z(c.z + R(-1.5, 1.5))
      if (worldId === 'w2') {
        if (rand() < 0.55) {
          // palm: bent trunk + fronds
          const h = R(6, 10)
          for (let k = 0; k < 6; k++) decor.cyl(0.42 - k * 0.03, h / 6 + 0.1, '#9a6a3a', x + k * 0.18, y + (k + 0.5) * (h / 6), z, 0, 0, -0.06 * k, 6)
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU
            decor.box(4.2, 0.18, 1.1, pick(['#2e9a34', '#3fbf3f', '#5bd64a']), x + 1.1 + Math.cos(a) * 1.8, y + h - 0.2, z + Math.sin(a) * 1.8, 0, -a, -0.35)
          }
        } else {
          decor.cyl(0.6, R(5, 9), '#7a4a26', x, y + 3, z, 0, 0, 0, 7)
          for (let k = 0; k < 5; k++) decor.box(R(3, 5), R(1.6, 2.4), R(3, 5), pick(['#2e9a34', '#3fbf3f', '#1f7a2a', '#5bd64a']), x + R(-2, 2), y + R(6, 9), z + R(-2, 2), 0, R(0, 3), 0)
        }
      } else {
        const h = R(3, 9)
        decor.cone(R(0.9, 1.7), h, pick(['#1d1626', '#2a1f3a', '#140f1a']), x, y + h / 2, z, R(-0.15, 0.15), 0, R(-0.15, 0.15), 5)
      }
    })
    root.add(decor.build(batchMaterial(true)))
  }

  // --- Landmark in the plaza ---------------------------------------------------------------------
  if (worldId === 'w2') {
    // the Great Banyan: thick trunk, buttress roots, a layered canopy, glowing mushrooms
    const b = new Batch()
    b.cyl(3.2, 16, '#7a4a26', X(0), 8, Z(0), 0, 0, 0, 10, 2.4)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      b.bar([X(Math.cos(a) * 5.5), 0, Z(Math.sin(a) * 5.5)], [X(Math.cos(a) * 1.8), 5, Z(Math.sin(a) * 1.8)], 1.1, '#6a3e20')
    }
    for (let i = 0; i < 26; i++) {
      const a = rand() * TAU
      const r = R(0, 11)
      b.box(R(5, 8), R(2.2, 3.4), R(5, 8), pick(['#2e9a34', '#3fbf3f', '#1f7a2a', '#5bd64a']), X(Math.cos(a) * r), R(15, 21), Z(Math.sin(a) * r), 0, R(0, 3), 0)
    }
    for (let i = 0; i < 14; i++) {
      const a = rand() * TAU
      const r = R(8, 12)
      const len = R(4, 10)
      b.box(0.25, len, 0.25, '#3fbf3f', X(Math.cos(a) * r), 16 - len / 2, Z(Math.sin(a) * r))
    }
    root.add(b.build(batchMaterial(true)))
    const shrooms = new Batch()
    for (let i = 0; i < 16; i++) {
      const a = rand() * TAU
      const r = R(6.5, 12.5)
      const h = R(0.4, 1)
      shrooms.cyl(0.18, h, '#f6f0e0', X(Math.cos(a) * r), h / 2 + 0.1, Z(Math.sin(a) * r), 0, 0, 0, 6)
      shrooms.ball(R(0.4, 0.7), pick(['#38e1ff', '#c56bff', '#5dff9a']), X(Math.cos(a) * r), h + 0.15, Z(Math.sin(a) * r), 1, 0.55, 1)
    }
    const sm = shrooms.build(neon('#7fffe0', 2.2), false)
    root.add(sm)
    boxCollider(3.2, 8, 3.2, X(0), 8, Z(0))
    pools.glow.addEmitter({ rate: 8, make: () => ({ ...sparkleParticle(X(rnd(-12, 12)), rnd(1, 6), Z(rnd(-12, 12)), pick(['#c8ff5a', '#7fffe0']), 0.5), life: rnd(2, 4), vx: rnd(-0.6, 0.6), vz: rnd(-0.6, 0.6), wobble: 1.5 }) })
    // a lily pond south-east of the tree
    const pond = new Mesh(new CircleGeometry(5, 28), waterMaterial({ flow: [0.3, 0.2] }))
    pond.rotation.x = -Math.PI / 2
    pond.position.set(X(22), 0.12, Z(-14))
    root.add(pond)
    updates.push((dt, t) => (pond.material.uniforms.t.value = t))
    const rim = new Mesh(new TorusGeometry(5.1, 0.45, 6, 28), studMat('#8a9478'))
    rim.rotation.x = Math.PI / 2
    rim.position.set(X(22), 0.2, Z(-14))
    root.add(rim)
  } else {
    // the Magma Spire: an obsidian obelisk in a lava pool, a ring of basalt and a fire fountain
    const pool = new Mesh(new CircleGeometry(9, 32), lavaMaterial({ flow: [0.2, 0.3], scale: 0.18 }))
    pool.rotation.x = -Math.PI / 2
    pool.position.set(X(0), 0.12, Z(0))
    root.add(pool)
    updates.push((dt, t) => (pool.material.uniforms.t.value = t))
    const b = new Batch()
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU
      const h = R(0.8, 2)
      b.cyl(1.1, h, pick(['#2e262c', '#3a3036']), X(Math.cos(a) * 9.6), h / 2, Z(Math.sin(a) * 9.6), 0, R(0, 1), 0, 6)
    }
    b.box(3.2, 18, 3.2, '#1d1626', X(0), 9, Z(0), 0, Math.PI / 4, 0)
    b.cone(2.3, 5, '#2a1f3a', X(0), 20.5, Z(0), 0, Math.PI / 4, 0, 4)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU
      b.cone(0.7, R(3, 6), '#140f1a', X(Math.cos(a) * 3.4), 1.5, Z(Math.sin(a) * 3.4), Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3, 5)
    }
    root.add(b.build(batchMaterial(true)))
    const runes = new Batch()
    for (let i = 0; i < 5; i++) for (const s of SIDES) runes.box(0.2, 1.2, 0.2, '#ff6a1a', X(s * 1.64), 3 + i * 3, Z(0), 0, Math.PI / 4, 0)
    root.add(runes.build(neon('#ff6a1a', 4), false))
    boxCollider(9.8, 2, 9.8, X(0), 1, Z(0))
    pools.fire.addEmitter({ rate: 46, make: () => ({ ...fireParticle(X(rnd(-1.2, 1.2)), 23, Z(rnd(-1.2, 1.2)), 2.2), vx: rnd(-2.5, 2.5), vy: rnd(4, 9), vz: rnd(-2.5, 2.5), gravity: -5 }) })
    pools.fire.addEmitter({ rate: 20, make: () => ({ ...fireParticle(X(rnd(-8, 8)), 0.3, Z(rnd(-8, 8)), 1), vy: rnd(1, 3) }) })
    const light = new PointLight('#ff6a1a', 40, 40, 1.6)
    light.position.set(X(0), 6, Z(0))
    root.add(light)
    updates.push((dt, t) => (light.intensity = 36 + Math.sin(t * 7) * 5 + Math.sin(t * 17) * 3))
  }

  // --- Course gate (north) --------------------------------------------------------------------------
  {
    const b = new Batch()
    const gz = Z(HUB.gateZ + 1)
    for (const s of SIDES) {
      const x = X(s * (gw + 1.6))
      if (worldId === 'w2') {
        for (let i = 0; i < 5; i++) b.box(3, 2.2, 3, pick(['#c4572a', '#2fa8c4', '#ffd21f', '#5fd13a']), x, 1.1 + i * 2.2, gz)
        b.box(1, 0.4, 0.1, '#ffffff', x - 0.6, 9.5, gz + 1.52)
      } else {
        b.box(3, 12, 3, '#1d1626', x, 6, gz)
        b.cone(2.1, 3, '#2a1f3a', x, 13.5, gz, 0, Math.PI / 4, 0, 4)
      }
      boxCollider(1.5, 6, 1.5, x, 6, gz)
    }
    b.box(gw * 2 + 6.4, 1.6, 2.4, worldId === 'w2' ? '#7a4a26' : '#2a1f3a', X(0), 11.6, gz)
    root.add(b.build(batchMaterial(true)))
    sign(root, X(0), 16, gz, [
      { text: T.course, size: 3.2, color: T.accent },
      { text: T.courseSub, size: 1.2, color: '#ffffff' },
    ])
    if (worldId === 'w3') {
      for (const s of SIDES) pools.fire.addEmitter({ rate: 20, make: () => fireParticle(X(s * (gw + 1.6)) + rnd(-0.6, 0.6), 15.2, gz + rnd(-0.6, 0.6), 1) })
    }
  }

  // --- Eggs (west) --------------------------------------------------------------------------------------
  const eggs = EGGS.filter((e) => e.world === worldId)
  const eggSpots = []
  eggs.forEach((def, i) => {
    const x = X(HUB.eggs.x)
    const z = Z(HUB.eggs.z[i] ?? i * 12)
    const ped = buildPedestal(def.label)
    ped.position.set(x, 0, z)
    root.add(ped)
    boxCollider(1.5, 0.5, 1.5, x, 0.3, z)
    const egg = buildEgg(def)
    egg.position.set(x, 0.9, z)
    root.add(egg)
    sign(root, x, 6.2, z, [
      { text: def.tier, size: 1.4, color: def.label },
      { text: def.name, size: 1.4, color: '#ffffff' },
      { text: `🏆 ${fmt(def.cost)}`, size: 1.05, color: '#ffd21f' },
    ])
    const ring = glowRing(def.label, 2.4, 2.2)
    ring.position.set(x, 0.02, z)
    root.add(ring)
    eggSpots.push({ def, egg, ring, x, z })
    triggers.push({ test: near(x, z, 3.4), prompt: () => ({ egg: def.id }) })
  })
  sign(root, X(HUB.eggs.x), 13, Z(1), [
    { text: T.eggs, size: 3.2, color: T.accent },
    { text: 'Rarer pets, bigger boosts!', size: 1.3, color: '#ffffff' },
  ])
  updates.push((dt, t) => {
    for (const e of eggSpots) {
      e.egg.position.y = 0.9 + Math.sin(t * 1.8 + e.z) * 0.18
      e.egg.rotation.y = t * 0.5 + e.z
      e.ring.userData.update(t)
    }
  })

  // --- Treadmills (east) ---------------------------------------------------------------------------
  const mills = []
  {
    const list = WORLD_TREADMILLS[worldId]
    const cx = X(HUB.mills.x)
    let z = Z(HUB.mills.z0)
    const gap = 0.8
    for (const def of list) {
      const [w, l] = MILL_SIZE[def.size]
      const mz = z + w / 2
      z += w + gap
      const m = buildTreadmill(def)
      m.position.set(cx, 0, mz)
      m.rotation.y = -Math.PI / 2
      root.add(m)
      const h = m.userData.size?.h ?? 0.4
      boxCollider(l / 2, h / 2, w / 2 - 0.1, cx, h / 2, mz)
      sign(root, cx + 1.5, (def.size === 'xl' ? 7 : 4.8) + h, mz, [
        { text: `${def.mult}x Speed`, size: def.size ? 1.7 : 1.3, color: def.size === 'xl' ? '#ffb020' : def.size ? '#ff6dff' : '#ffd21f' },
        { text: def.name, size: 0.8, color: '#ffffff' },
        def.req ? { text: `🔒 ${treadmillLabel(def)}`, size: 0.8, color: '#ff8ad6' } : { text: 'Free', size: 0.8, color: '#9fe8ff' },
      ])
      if (def.glow) pools.glow.addEmitter({ rate: 8, make: () => sparkleParticle(cx, h + 0.4, mz, def.color, w / 2) })
      mills.push({ def, m, w, l, x: cx, z: mz })
      triggers.push({
        test: inRect(cx - l / 2, cx + l / 2, mz - w / 2 + 0.2, mz + w / 2 - 0.2),
        afk: () => (treadmillUnlocked(def) ? def.mult : 0),
        enter: () => {
          if (!treadmillUnlocked(def)) toast(`${def.name} (${def.mult}x) needs ${treadmillLabel(def)}`, 'error')
        },
        prompt: () => null,
      })
    }
    sign(root, X(HUB.mills.x + 10), 14, Z(0), [
      { text: T.mills, size: 3.2, color: T.accent },
      { text: `Train AFK · World Boost x${W.bonus}!`, size: 1.3, color: '#ffffff' },
    ])
    updates.push((dt) => {
      for (const ml of mills) {
        const tex = ml.m.userData.beltTexture
        if (tex) tex.offset.y += dt * (ml.def.mult >= 300 ? 1.6 : 0.9)
      }
    })
  }

  // --- Bike pads (south) ------------------------------------------------------------------------------
  {
    const bikes = WORLD_BIKES.filter((b) => b.world === worldId)
    const padMats = {
      equipped: studMat('#3ddc3d', { emissive: '#3ddc3d', emissiveIntensity: 0.25 }),
      open: studMat('#ffd21f', { emissive: '#ffd21f', emissiveIntensity: 0.2 }),
      locked: studMat('#e8262e', { emissive: '#e8262e', emissiveIntensity: 0.15 }),
    }
    const slots = []
    bikes.forEach((def, i) => {
      const x = X(HUB.bikes.x[i] ?? i * 14)
      const z = Z(HUB.bikes.z)
      const pad = new Mesh(new BoxGeometry(5, 0.2, 5), padMats.locked)
      pad.position.set(x, 0.18, z)
      pad.receiveShadow = true
      root.add(pad)
      const bike = buildBike(def)
      bike.scale.setScalar(1.35)
      bike.position.set(x, 0.3, z)
      root.add(bike)
      sign(root, x, 4.4, z, [
        { text: def.name, size: 1.05, color: T.accent },
        { text: `+${fmt(def.perSpeed)}/Speed`, size: 1, color: '#ffffff' },
        { text: `🏆 ${fmt(def.wins)} Wins`, size: 1, color: '#ffd21f' },
      ])
      slots.push({ def, pad, bike, x, z })
      triggers.push({
        test: inRect(x - 2.6, x + 2.6, z - 2.6, z + 2.6),
        prompt: () => (state.bike === def.id ? null : bikeUnlocked(def) ? { text: `Equip ${def.name}`, action: () => equipBike(def.id) } : { text: `${def.name}: needs ${fmt(def.wins)} Wins`, action: () => equipBike(def.id) }),
      })
    })
    sign(root, X(0), 11, Z(HUB.bikes.z + 6), [
      { text: T.bikes, size: 3, color: '#ffc21f' },
      { text: 'Faster bikes fly farther!', size: 1.2, color: '#ffffff' },
    ])
    let lastKey = ''
    updates.push((dt, t) => {
      const key = `${state.bike}|${state.wins >= 0 ? slots.filter((s) => bikeUnlocked(s.def)).length : 0}`
      if (key !== lastKey) {
        lastKey = key
        for (const s of slots) s.pad.material = state.bike === s.def.id ? padMats.equipped : bikeUnlocked(s.def) ? padMats.open : padMats.locked
      }
      for (const s of slots) s.bike.rotation.y = t * 0.5 + s.x
    })
  }

  // --- Portals ---------------------------------------------------------------------------------------
  function portal(x, z, target) {
    const tw = WORLDS.find((w) => w.id === target)
    const g = new Group()
    g.position.set(X(x), 0, Z(z))
    root.add(g)
    const base = new Mesh(new CylinderGeometry(4.4, 4.8, 0.6, 28), studMat(T.path, { roughness: 0.85 }))
    base.position.y = 0.3
    base.receiveShadow = base.castShadow = true
    g.add(base)
    const frame = new Batch()
    const n = 11
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.15
      const h = 2 + Math.abs(Math.sin(i * 2.3)) * 1.6
      const r = 3.6
      frame.box(1.2, h, 1.1, i % 3 === 0 ? T.accent : worldId === 'w2' ? '#8a9478' : '#2a1f3a', Math.cos(a) * r, 3.9 + Math.sin(a) * r, 0, 0, 0, a + Math.PI / 2)
    }
    const fm = frame.build(batchMaterial(true))
    g.add(fm)
    const colors = target === 'w1' ? ['#38c8ff', '#9ff0ff'] : target === 'w2' ? ['#38ff6a', '#d6ff4a'] : ['#ff5a1a', '#ffd21f']
    const swirl = swirlMaterial(colors[0], colors[1])
    const disc = new Mesh(new CircleGeometry(3.2, 48), swirl)
    disc.position.y = 3.9
    g.add(disc)
    g.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2
    boxCollider(0.6, 3, 4.2, X(x), 3, Z(z), g.rotation.y + Math.PI / 2)
    const status = textSprite(1.1)
    sign(g, 0, 10, 0, [{ text: tw.id === 'w1' ? 'WORLD 1' : tw.name.toUpperCase(), size: 2, color: colors[0] }])
    status.position.set(0, 8.2, 0)
    g.add(status)
    pools.glow.addEmitter({ rate: 12, make: () => sparkleParticle(X(x), 3.9 + rnd(-2.5, 2.5), Z(z), colors[0], 1.2) })
    updates.push((dt, t) => {
      swirl.uniforms.t.value = t
      const open = worldUnlocked(target)
      status.userData.set(open ? 'Enter!' : `🔒 Lvl. ${tw.level}`, open ? '#8ef03c' : '#ff8a8a')
    })
    triggers.push({
      test: near(X(x), Z(z), 5.5),
      prompt: () => ({ text: worldUnlocked(target) ? `Travel to ${tw.name}` : `${tw.name} (Level ${tw.level})`, action: () => travelTo(target) }),
    })
  }
  portal(HUB.portals.x[0], HUB.portals.z, 'w1')
  portal(HUB.portals.x[1], HUB.portals.z, worldId === 'w2' ? 'w3' : 'w2')

  // --- World chest -----------------------------------------------------------------------------------
  {
    const cx = X(HUB.chest.x)
    const cz = Z(HUB.chest.z)
    const chest = buildChest()
    chest.position.set(cx, 0.1, cz)
    chest.rotation.y = 0.6
    root.add(chest)
    boxCollider(1.3, 0.9, 1, cx, 0.9, cz, 0.6)
    const ring = glowRing(T.accent, 2.6, 2.4)
    ring.position.set(cx, 0.02, cz)
    root.add(ring)
    const head = sign(root, cx, 5.4, cz, [{ text: `${W.short.toUpperCase()} CHEST`, size: 1.1, color: T.accent }])
    const timer = textSprite(0.9)
    timer.position.set(0, -1.1, 0)
    head.add(timer)
    const c = WORLD_CHESTS[worldId]
    sign(root, cx, 3.2, cz, [{ text: `🏆 ${fmt(c.wins[0])}-${fmt(c.wins[1])}`, size: 0.7, color: '#ffd21f' }])
    pools.glow.addEmitter({ rate: 10, active: () => worldChestReadyIn(worldId) === 0, make: () => sparkleParticle(cx, 0.5, cz, T.accent, 2) })
    updates.push((dt, t) => {
      ring.userData.update(t)
      const left = worldChestReadyIn(worldId)
      timer.userData.set(left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : 'READY!', left > 0 ? '#ffffff' : '#8ef03c')
      const lid = chest.userData.lid
      if (lid) lid.rotation.x += ((left > 0 ? 0 : -1.3 - Math.sin(t * 3) * 0.12) - lid.rotation.x) * Math.min(1, dt * 6)
      ring.visible = left === 0
    })
    triggers.push({
      test: near(cx, cz, 3.6),
      prompt: () => null,
      enter: () => {
        if (!claimWorldChest(worldId)) {
          const left = worldChestReadyIn(worldId)
          toast(`${W.short} Chest in ${Math.floor(left / 60)}m ${Math.floor(left % 60)}s`, 'info')
        }
      },
    })
  }

  // --- Ambient --------------------------------------------------------------------------------------
  if (worldId === 'w2') {
    pools.glow.addEmitter({ rate: 6, make: () => ({ ...sparkleParticle(X(rnd(-H.x, H.x)), rnd(0.5, 4), Z(rnd(-H.z, H.z)), pick(['#ffd21f', '#ff7ab0', '#7fe0ff']), 0.3), life: rnd(2, 4), vx: rnd(-1, 1), vz: rnd(-1, 1), wobble: 2 }) })
  } else {
    pools.fire.addEmitter({ rate: 10, make: () => ({ ...fireParticle(X(rnd(-H.x, H.x)), 0.2, Z(rnd(-H.z, H.z)), 0.35), vy: rnd(1.5, 4), life: rnd(1.5, 3), wobble: 1 }) })
  }

  // Spawn arch sparkle ring where you arrive
  const arrive = glowRing(T.accent, 3, 3)
  arrive.position.set(X(HUB.spawn.x), 0.15, Z(HUB.spawn.z))
  root.add(arrive)
  updates.push((dt, t) => arrive.userData.update(t))

  return {
    root,
    triggers,
    spawn: { x: X(HUB.spawn.x), y: 0.3, z: Z(HUB.spawn.z), facing: Math.PI },
    update(dt, t) {
      if (!isActive()) return
      for (const u of updates) u(dt, t)
    },
  }
}
