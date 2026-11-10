// Lobby props: training treadmills, the reward chest, leaderboard towers and
// display pedestals. Chunky voxel style with rounded edges; geometries and
// materials are cached and shared (do not dispose them per prop).
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'

const FONT = '"Fredoka", "Arial Black", sans-serif'
const geos = new Map()
const mats = new Map()
const canvases = new Map()
function cached(map, k, make) {
  let v = map.get(k)
  if (v === undefined) {
    v = make()
    map.set(k, v)
  }
  return v
}
const key = (...a) => a.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v))).join('|')

const plastic = (c, roughness = 0.38, metalness = 0.05) =>
  cached(mats, key('pl', c, roughness, metalness), () => new MeshStandardMaterial({ color: c, roughness, metalness }))
const GOLD = () => cached(mats, 'gold', () => new MeshStandardMaterial({ color: '#ffc531', roughness: 0.28, metalness: 0.65, emissive: '#5a3a00', emissiveIntensity: 0.25 }))
const CHROME = () => cached(mats, 'chrome', () => new MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.2, metalness: 0.9 }))
const glowMat = (c) => cached(mats, key('neon', c), () => neon(c))
const rbox = (w, h, d, r = 0.05) =>
  cached(geos, key('rb', w, h, d, r), () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002)))
const box = (w, h, d) => cached(geos, key('box', w, h, d), () => new BoxGeometry(w, h, d))
const cyl = (r, h, seg = 16) => cached(geos, key('cyl', r, h, seg), () => new CylinderGeometry(r, r, h, seg))
const cylX = (r, len, seg = 18) => cached(geos, key('cylX', r, len, seg), () => new CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2))

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  if (rx || ry || rz) m.rotation.set(rx, ry, rz)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}
const SIDES = [-1, 1]
function shade(hex, k) {
  const c = new Color(hex)
  const hsl = {}
  c.getHSL(hsl)
  return '#' + c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k))).getHexString()
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function srgb(tex) {
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// --- Treadmill ----------------------------------------------------------------
const TREAD_SIZES = {
  default: { w: 3.2, l: 5, h: 0.4 },
  lg: { w: 4.4, l: 6.5, h: 0.5 },
  xl: { w: 6, l: 8, h: 0.6 },
}
// Dark rubber belt with slats and one chevron pointing at the console (-Z).
function beltCanvas(color) {
  return cached(canvases, key('belt', color), () => {
    const S = 256
    const c = makeCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#2a2c33'
    ctx.fillRect(0, 0, S, S)
    for (let y = 0; y < S; y += 32) {
      ctx.fillStyle = '#3b3e48'
      ctx.fillRect(0, y, S, 5)
      ctx.fillStyle = '#1d1f24'
      ctx.fillRect(0, y + 5, S, 2)
    }
    // chevron (canvas up = -Z = towards the console)
    ctx.beginPath()
    ctx.moveTo(S * 0.5, S * 0.16)
    ctx.lineTo(S * 0.86, S * 0.52)
    ctx.lineTo(S * 0.86, S * 0.74)
    ctx.lineTo(S * 0.5, S * 0.38)
    ctx.lineTo(S * 0.14, S * 0.74)
    ctx.lineTo(S * 0.14, S * 0.52)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
    return c
  })
}
function hazardTex(a, b) {
  return cached(mats, key('hazard', a, b), () => {
    const S = 128
    const c = makeCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = b
    ctx.fillRect(0, 0, S, S)
    ctx.fillStyle = a
    for (let i = -2; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(i * (S / 2), S)
      ctx.lineTo(i * (S / 2) + S / 4, S)
      ctx.lineTo(i * (S / 2) + S / 4 + S, 0)
      ctx.lineTo(i * (S / 2) + S, 0)
      ctx.closePath()
      ctx.fill()
    }
    const t = srgb(new CanvasTexture(c))
    t.wrapS = t.wrapT = RepeatWrapping
    return t
  })
}
const hazardMat = (a, b, rx, ry) =>
  cached(mats, key('hazardMat', a, b, rx, ry), () => {
    const t = hazardTex(a, b).clone()
    t.repeat.set(rx, ry)
    t.needsUpdate = true
    return new MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.05 })
  })
function screenMat(color) {
  return cached(mats, key('screen', color), () => {
    const W = 256
    const H = 160
    const c = makeCanvas(W, H)
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0d1f3a')
    g.addColorStop(1, '#06101f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(120,200,255,0.18)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 0; y < H; y += 16) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    const rand = mulberry32(41)
    for (let i = 0; i < 9; i++) {
      const h = 30 + i * 9 + rand() * 18
      ctx.fillStyle = color
      ctx.fillRect(18 + i * 25, H - 16 - h, 16, h)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 30px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('SPEED', 14, 10)
    ctx.fillStyle = color
    ctx.fillText('>>>', W - 70, 10)
    const tex = srgb(new CanvasTexture(c))
    return new MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 })
  })
}

// def: { color, alt?, size?: 'lg' | 'xl', glow? } from TREADMILLS.
// Origin = centre of the footprint on the ground; console at the -Z end.
export function buildTreadmill(def) {
  const { w, l, h } = TREAD_SIZES[def.size] ?? TREAD_SIZES.default
  const S = w / 3.2
  const g = new Group()
  g.name = 'treadmill'
  const color = def.color
  const body = plastic(color)
  const dark = plastic('#23252d', 0.6)
  const alt = def.alt ?? shade(color, 0.72)
  const railW = 0.34 * S
  const railH = 0.22
  const deckTop = h - 0.08
  const railTop = deckTop + railH
  const xl = def.size === 'xl'

  // feet, skirt and deck
  add(g, box(w - 0.3, 0.12, l - 0.3), dark, 0, 0.06, 0)
  for (const sx of SIDES) for (const sz of SIDES) add(g, rbox(0.42, 0.14, 0.42, 0.04), dark, sx * (w / 2 - 0.25), 0.07, sz * (l / 2 - 0.25))
  add(g, rbox(w, deckTop - 0.1, l, 0.06), body, 0, 0.1 + (deckTop - 0.1) / 2, 0)
  // belt + rollers
  const beltW = w - 2 * railW - 0.08
  const beltL = l - 0.7
  const tex = srgb(new CanvasTexture(beltCanvas(color)))
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(1, beltL / beltW)
  const belt = add(g, box(beltW, 0.08, beltL), new MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 }), 0, h - 0.04, 0)
  belt.name = 'belt'
  for (const sz of SIDES) add(g, cylX(0.07, beltW + 0.04), plastic('#3a3d46', 0.4, 0.5), 0, h - 0.06, sz * (beltL / 2))
  // step plate at the entry (+Z) end, hazard lip
  add(g, box(beltW, 0.02, 0.3), hazardMat(xl ? color : '#ffd21f', '#1d1d1d', beltW / 0.6, 0.5), 0, deckTop + 0.01, l / 2 - 0.17)
  add(g, rbox(beltW, 0.06, 0.12, 0.02), plastic('#8d939c', 0.3, 0.6), 0, deckTop + 0.03, -l / 2 + 0.22)
  // side rails with studs
  const railMat = xl ? hazardMat(color, alt, 1, l / 1.2) : plastic(alt)
  for (const sx of SIDES) {
    const x = sx * (w / 2 - railW / 2)
    add(g, rbox(railW, railH, l, 0.05), railMat, x, deckTop + railH / 2, 0)
    const n = Math.floor(l / 0.55)
    for (let i = 0; i < n; i++) add(g, cyl(0.075 * S, 0.06, 14), plastic(alt), x, railTop + 0.03, -l / 2 + 0.275 + i * ((l - 0.55) / (n - 1)))
  }
  // uprights, handles and console at -Z
  const postH = 1.35 + 0.15 * S
  const postZ = -l / 2 + 0.3
  const postW = 0.22 * S
  for (const sx of SIDES) {
    const x = sx * (w / 2 - railW / 2)
    add(g, rbox(postW, postH, postW, 0.05), body, x, railTop + postH / 2, postZ)
    add(g, rbox(postW + 0.06, 0.12, postW + 0.06, 0.04), dark, x, railTop + 0.06, postZ)
    // side handrail running back along the rail
    const hy = railTop + 0.95
    add(g, rbox(0.09, 0.09, 1.3 * S, 0.035), plastic('#d9dde4', 0.3, 0.6), x, hy, postZ + 0.65 * S)
    add(g, rbox(0.09, hy - railTop, 0.09, 0.035), plastic('#d9dde4', 0.3, 0.6), x, (hy + railTop) / 2, postZ + 1.3 * S)
  }
  add(g, cylX(0.05, w - railW, 16), plastic('#d9dde4', 0.3, 0.6), 0, railTop + 1.0, postZ + 0.12)
  for (const sx of SIDES) add(g, cylX(0.06, 0.32 * S, 12), dark, sx * (w / 2 - railW - 0.3 * S), railTop + 1.0, postZ + 0.12)
  const con = new Group()
  con.position.set(0, railTop + postH + 0.18 * S, postZ + 0.05)
  con.rotation.x = -0.4
  g.add(con)
  const cw = w * 0.62
  const ch = 0.62 * S
  add(con, rbox(cw, ch, 0.22, 0.07), body, 0, 0, 0)
  add(con, rbox(cw * 0.9, ch * 0.8, 0.06, 0.03), dark, 0, 0, 0.1)
  add(con, cached(geos, key('scr', cw, ch), () => new PlaneGeometry(cw * 0.82, ch * 0.66)), screenMat(color), 0, 0.01, 0.135)
  for (const [i, c] of ['#ff3d3d', '#ffd21f', '#3dff6a'].entries()) add(con, cyl(0.05 * S, 0.06, 14), plastic(c, 0.3), (i - 1) * 0.18 * S, ch / 2 + 0.03, 0.02)
  add(con, rbox(cw * 0.5, 0.1, 0.16, 0.04), dark, 0, -ch / 2 - 0.02, 0.02)

  if (xl) {
    // dark canopy frame with hazard beams
    const roofY = h + 3.8
    const frame = plastic('#1d1d22', 0.55)
    for (const sx of SIDES) {
      for (const sz of SIDES) {
        const x = sx * (w / 2 - railW / 2)
        const z = sz * (l / 2 - 0.28)
        add(g, rbox(0.34, roofY - railTop, 0.34, 0.05), frame, x, (roofY + railTop) / 2, z)
        add(g, rbox(0.5, 0.18, 0.5, 0.05), plastic(alt), x, railTop + 0.09, z)
      }
    }
    for (const sz of SIDES) add(g, rbox(w + 0.1, 0.4, 0.42, 0.06), hazardMat(color, alt, w / 1.2, 0.5), 0, roofY, sz * (l / 2 - 0.28))
    for (const sx of SIDES) add(g, rbox(0.42, 0.4, l, 0.06), hazardMat(color, alt, l / 1.2, 0.5), sx * (w / 2 - railW / 2), roofY, 0)
    add(g, box(w - 0.4, 0.14, l - 0.4), frame, 0, roofY + 0.12, 0)
    for (let i = -2; i <= 2; i++) add(g, rbox(w - 0.4, 0.16, 0.18, 0.04), frame, 0, roofY - 0.05, (i * (l - 0.6)) / 5)
    for (const sx of SIDES) add(g, box(0.06, 0.06, l - 0.8), glowMat(color), sx * (w / 2 - railW / 2 - 0.24), roofY - 0.22, 0)
  }
  if (def.glow) {
    const nm = glowMat(color)
    for (const sx of SIDES) {
      add(g, box(0.06, 0.06, l + 0.02), nm, sx * (w / 2 + 0.005), deckTop - 0.02, 0)
      add(g, box(0.05, 0.05, l - 0.1), nm, sx * (w / 2 - railW - 0.005), railTop - 0.01, 0)
      add(g, box(0.05, postH, 0.05), nm, sx * (w / 2 - railW / 2), railTop + postH / 2, postZ + postW / 2 + 0.01)
    }
    for (const sz of SIDES) add(g, box(w + 0.02, 0.06, 0.06), nm, 0, deckTop - 0.02, sz * (l / 2 + 0.005))
    add(con, box(cw + 0.04, 0.04, 0.04), nm, 0, ch / 2 + 0.005, 0.1)
    add(con, box(cw + 0.04, 0.04, 0.04), nm, 0, -ch / 2 - 0.005, 0.1)
  }
  g.userData = { beltTexture: tex, belt, size: { w, l, h } }
  return g
}

// --- Chest --------------------------------------------------------------------
// ~2.4 (x) x 1.6 (y) x 1.8 (z). userData.lid hinges on the back top edge;
// open it with a negative rotation.x (e.g. -1.9).
export function buildChest() {
  const g = new Group()
  g.name = 'chest'
  const blue = plastic('#2f6bff', 0.32)
  const blueDark = plastic('#1d45c8', 0.4)
  const gold = GOLD()
  const W = 2.4
  const D = 1.8
  const baseH = 1.0
  add(g, rbox(W, baseH, D, 0.08), blue, 0, baseH / 2, 0)
  add(g, rbox(W - 0.24, baseH - 0.3, 0.02, 0.01), blueDark, 0, baseH / 2 - 0.02, D / 2 + 0.005)
  for (const sx of SIDES) {
    add(g, rbox(0.22, baseH + 0.04, D + 0.06, 0.04), gold, sx * 0.62, baseH / 2, 0)
    for (const sz of SIDES) add(g, rbox(0.32, 0.32, 0.32, 0.05), gold, sx * (W / 2 - 0.12), 0.15, sz * (D / 2 - 0.12))
  }
  add(g, rbox(W + 0.06, 0.12, D + 0.06, 0.04), gold, 0, baseH - 0.04, 0)
  // treasure peeking out when the lid opens
  add(g, rbox(W - 0.4, 0.14, D - 0.4, 0.05), gold, 0, baseH + 0.04, 0)
  const rand = mulberry32(7)
  for (let i = 0; i < 14; i++) {
    const c = add(g, cyl(0.12, 0.04, 16), gold, (rand() - 0.5) * 1.6, baseH + 0.12 + rand() * 0.08, (rand() - 0.5) * 1.0)
    c.rotation.set((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8)
  }
  add(g, rbox(0.22, 0.22, 0.22, 0.04), plastic('#ff3d8b', 0.15, 0.2), 0.45, baseH + 0.2, -0.1, 0.4, 0.6, 0)
  add(g, rbox(0.18, 0.18, 0.18, 0.04), plastic('#38e1ff', 0.15, 0.2), -0.5, baseH + 0.18, 0.15, 0.2, 0.3, 0.5)
  // lock plate + keyhole
  add(g, rbox(0.46, 0.5, 0.1, 0.04), gold, 0, baseH - 0.24, D / 2 + 0.04)
  add(g, cyl(0.06, 0.03, 16), plastic('#1b1b20'), 0, baseH - 0.2, D / 2 + 0.095, Math.PI / 2)
  add(g, box(0.05, 0.12, 0.03), plastic('#1b1b20'), 0, baseH - 0.29, D / 2 + 0.095)

  // lid: pivot on the back top edge, stepped voxel dome
  const lid = new Group()
  lid.name = 'lid'
  lid.position.set(0, baseH, -D / 2)
  g.add(lid)
  add(lid, rbox(W, 0.36, D, 0.08), blue, 0, 0.18, D / 2)
  add(lid, rbox(W - 0.2, 0.26, D - 0.3, 0.08), blue, 0, 0.47, D / 2)
  for (const sx of SIDES) {
    add(lid, rbox(0.22, 0.4, D + 0.06, 0.04), gold, sx * 0.62, 0.18, D / 2)
    add(lid, rbox(0.22, 0.3, D - 0.26, 0.04), gold, sx * 0.62, 0.47, D / 2)
    for (const sz of SIDES) add(lid, rbox(0.32, 0.32, 0.32, 0.05), gold, sx * (W / 2 - 0.12), 0.2, D / 2 + sz * (D / 2 - 0.12))
  }
  add(lid, rbox(W + 0.06, 0.1, D + 0.06, 0.04), gold, 0, 0.05, D / 2)
  add(lid, rbox(0.3, 0.26, 0.08, 0.03), gold, 0, 0.08, D + 0.03)
  for (const sx of SIDES) add(lid, cyl(0.08, 0.04, 14), gold, sx * 0.62, 0.62, D / 2)
  g.userData = { lid, size: { w: W, h: 1.6, d: D } }
  return g
}

// --- Leaderboard --------------------------------------------------------------
const LB = { w: 7, d: 1.5, base: 0.3, pillar: 0.8, screenY0: 1.1, screenY1: 8.2, bandTop: 8.9 }
function brickMesh() {
  return cached(geos, 'lbBricks', () => {
    const rects = []
    const halfW = LB.w / 2
    const inner = halfW - LB.pillar
    // pillars, bottom band, top band
    rects.push([-halfW, -inner, 0, LB.bandTop], [inner, halfW, 0, LB.bandTop], [-inner, inner, 0, LB.screenY0], [-inner, inner, LB.screenY1, LB.bandTop])
    // crenellations (stepped: the middle merlon is taller)
    for (const [x, wd, top] of [[-3.1, 0.8, 9.5], [-1.65, 0.9, 9.5], [0, 1.6, 9.8], [1.65, 0.9, 9.5], [3.1, 0.8, 9.5]]) rects.push([x - wd / 2, x + wd / 2, LB.bandTop, top])
    const bricks = []
    const rand = mulberry32(2024)
    const bh = 0.4
    const bl = 0.8
    for (const [x0, x1, y0, y1] of rects) {
      const rows = Math.max(1, Math.round((y1 - y0) / bh))
      const rh = (y1 - y0) / rows
      for (let r = 0; r < rows; r++) {
        // global row index keeps the bond continuous between neighbouring regions
        const gi = Math.round((y0 + r * rh) / bh)
        let x = x0 - (gi % 2 ? bl / 2 : 0) - (((x0 % bl) + bl) % bl)
        for (; x < x1 - 1e-3; x += bl) {
          const a = Math.max(x, x0)
          const b = Math.min(x + bl, x1)
          if (b - a < 0.05) continue
          bricks.push({ x: (a + b) / 2, y: y0 + (r + 0.5) * rh, w: b - a - 0.05, h: rh - 0.05, dz: (rand() - 0.5) * 0.08, k: 0.86 + rand() * 0.22 })
        }
      }
    }
    return bricks
  })
}
function rankColor(i) {
  return ['#ffd23a', '#d7dee8', '#e0904a'][i] ?? null
}
function fmt(v) {
  if (typeof v !== 'number') return String(v ?? '')
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']
  let n = Math.abs(v)
  let u = 0
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000
    u++
  }
  const s = u === 0 ? String(Math.round(n)) : n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)
  return (v < 0 ? '-' : '') + s.replace(/\.0+$|(\.\d*?)0+$/, '$1') + units[u]
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function outlined(ctx, text, x, y, fill, stroke, lw) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = lw
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}
function paintBoard(ctx, W, H, title, rows, accent) {
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#16204a')
  bg.addColorStop(1, '#0c1330')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  // title bar
  roundRect(ctx, 14, 14, W - 28, 128, 26)
  ctx.fillStyle = accent
  ctx.fill()
  roundRect(ctx, 14, 14, W - 28, 56, 26)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 76px ${FONT}`
  outlined(ctx, fitText(ctx, title, W - 80), W / 2, 82, '#ffffff', '#0b1a3a', 12)
  // rows
  const top = 160
  const rh = 78
  for (let i = 0; i < 10; i++) {
    const y = top + i * rh
    const row = rows[i]
    const medal = rankColor(i)
    roundRect(ctx, 14, y, W - 28, rh - 8, 16)
    ctx.fillStyle = medal ? (i === 0 ? '#5a4512' : i === 1 ? '#3e4658' : '#56341a') : i % 2 ? '#1b275a' : '#24336f'
    ctx.fill()
    // rank badge
    ctx.beginPath()
    ctx.arc(62, y + (rh - 8) / 2, 28, 0, Math.PI * 2)
    ctx.fillStyle = medal ?? '#0e1736'
    ctx.fill()
    ctx.font = `700 34px ${FONT}`
    ctx.fillStyle = medal ? '#1b1b20' : '#ffffff'
    ctx.fillText(String(i + 1), 62, y + (rh - 8) / 2 + 2)
    ctx.textBaseline = 'middle'
    if (row) {
      ctx.font = `700 38px ${FONT}`
      ctx.textAlign = 'left'
      outlined(ctx, fitText(ctx, String(row.name ?? ''), 360), 108, y + (rh - 8) / 2 + 2, '#ffffff', '#0b1a3a', 7)
      ctx.textAlign = 'right'
      outlined(ctx, fmt(row.value), W - 36, y + (rh - 8) / 2 + 2, medal ?? '#7dff6a', '#0b1a3a', 7)
    } else {
      ctx.font = `700 34px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillText('---', 108, y + (rh - 8) / 2 + 2)
    }
    ctx.textAlign = 'center'
  }
}

// Stone-brick tower with a screen on its +Z face. ~7 wide x 10 tall x 1.5 deep
// (plus a 7.6 x 2 plinth), origin at the bottom centre. rows = [{ name, value }].
export function buildLeaderboard(title, rows = [], accent = '#ffb020') {
  const g = new Group()
  g.name = 'leaderboard'
  const { w, d, base: B, pillar, screenY0, screenY1, bandTop } = LB
  const inner = w / 2 - pillar
  // plinth
  add(g, rbox(w + 0.6, B, d + 0.5, 0.06), plastic('#5d6688', 0.7), 0, B / 2, 0)
  // bricks (one instanced draw call)
  const bricks = brickMesh()
  const bm = new InstancedMesh(
    cached(geos, 'unitBox', () => new BoxGeometry(1, 1, 1)),
    cached(mats, 'brick', () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0 })),
    bricks.length,
  )
  const m = new Matrix4()
  const q = new Quaternion()
  const tint = new Color('#7c86a6')
  const c = new Color()
  bricks.forEach((b, i) => {
    m.compose(new Vector3(b.x, b.y + B, b.dz / 2), q, new Vector3(b.w, b.h, d + b.dz))
    bm.setMatrixAt(i, m)
    bm.setColorAt(i, c.copy(tint).multiplyScalar(b.k))
  })
  bm.castShadow = true
  bm.receiveShadow = true
  g.add(bm)
  // mortar core so gaps read dark, and the panel behind the screen
  const mortar = plastic('#3f4560', 0.9)
  add(g, box(w - 0.08, bandTop - 0.05, d * 0.5), mortar, 0, B + (bandTop - 0.05) / 2, -d * 0.2)
  // screen
  const sw = inner * 2
  const sh = screenY1 - screenY0
  add(g, rbox(sw + 0.1, sh + 0.1, 0.2, 0.05), plastic('#11152a', 0.4), 0, B + screenY0 + sh / 2, d / 2 - 0.25)
  const canvas = makeCanvas(720, 960)
  const tex = srgb(new CanvasTexture(canvas))
  const screen = new Mesh(new PlaneGeometry(sw - 0.16, sh - 0.16), new MeshBasicMaterial({ map: tex, toneMapped: false }))
  screen.position.set(0, B + screenY0 + sh / 2, d / 2 - 0.14)
  screen.name = 'screen'
  g.add(screen)
  // glowing trims: green around the screen, accent up the pillars and along the top
  const green = glowMat('#5dff5a')
  const acc = glowMat(accent)
  const fz = d / 2 + 0.05
  for (const s of SIDES) {
    add(g, box(0.09, sh + 0.09, 0.09), green, s * (inner + 0.02), B + screenY0 + sh / 2, fz)
    add(g, box(0.09, bandTop + 0.05, 0.09), acc, s * (w / 2 + 0.02), B + bandTop / 2, fz)
  }
  for (const y of [screenY0, screenY1]) add(g, box(sw + 0.13, 0.09, 0.09), green, 0, B + y + (y === screenY0 ? -0.02 : 0.02), fz)
  add(g, box(w + 0.13, 0.09, 0.09), acc, 0, B + bandTop, fz)
  add(g, box(w + 0.13, 0.09, 0.09), acc, 0, B + 0.02, fz)

  let last = rows
  const redraw = (r = last) => {
    last = r ?? []
    paintBoard(canvas.getContext('2d'), canvas.width, canvas.height, title, last, accent)
    tex.needsUpdate = true
  }
  redraw(rows)
  document.fonts?.load?.('700 48px Fredoka').then(() => redraw(), () => {})
  g.userData = { redraw, screen, size: { w, h: B + 9.8, d } }
  return g
}

// --- Pedestal -----------------------------------------------------------------
// Dark slate plinth ~3 x 0.6 x 3, origin at the bottom centre. userData.top is
// the standing height of the inner surface.
export function buildPedestal(color = '#38e1ff') {
  const g = new Group()
  g.name = 'pedestal'
  const slate = plastic('#3a3f66', 0.55)
  const slateHi = plastic('#4a5080', 0.5)
  const ring = cached(mats, key('pedRing', color), () => new MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1, emissive: color, emissiveIntensity: 0.25 }))
  add(g, rbox(3, 0.45, 3, 0.06), slate, 0, 0.225, 0)
  add(g, rbox(2.8, 0.06, 2.8, 0.02), slateHi, 0, 0.02, 0)
  add(g, rbox(2.5, 0.12, 2.5, 0.03), plastic('#2c3052', 0.6), 0, 0.51, 0)
  for (const s of SIDES) {
    add(g, rbox(2.9, 0.15, 0.25, 0.04), ring, 0, 0.525, s * 1.325)
    add(g, rbox(0.25, 0.15, 2.4, 0.04), ring, s * 1.325, 0.525, 0)
  }
  for (const sx of SIDES) {
    for (const sz of SIDES) {
      add(g, rbox(0.5, 0.72, 0.5, 0.05), slateHi, sx * 1.35, 0.36, sz * 1.35)
      add(g, cyl(0.12, 0.07, 16), ring, sx * 1.35, 0.755, sz * 1.35)
    }
  }
  g.userData = { top: 0.57, size: { w: 3, h: 0.6, d: 3 } }
  return g
}
