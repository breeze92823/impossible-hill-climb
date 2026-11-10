import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { LOBBY } from '../config.js'

// Lego-style studded plastic: one near-white stud texture tinted by the material
// colour, mapped in WORLD space (triplanar, picked by the dominant normal axis)
// so instanced and stretched boxes all show studs at the same real size.

function paintStuds(size = 256, perSide = 4) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = '#ececec'
  g.fillRect(0, 0, size, size)
  const cell = size / perSide
  for (let i = 0; i < perSide; i++) {
    for (let j = 0; j < perSide; j++) {
      const cx = (i + 0.5) * cell
      const cy = (j + 0.5) * cell
      const r = cell * 0.27
      // faint tile seam
      g.strokeStyle = 'rgba(0,0,0,0.05)'
      g.lineWidth = 2
      g.strokeRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2)
      // drop shadow (light from top-left)
      g.fillStyle = 'rgba(0,0,0,0.16)'
      g.beginPath()
      g.arc(cx + r * 0.22, cy + r * 0.3, r, 0, Math.PI * 2)
      g.fill()
      // stud top with highlight
      const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.7, '#f3f3f3')
      grad.addColorStop(1, '#d9d9d9')
      g.fillStyle = grad
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.fill()
      // rim highlight arc
      g.strokeStyle = 'rgba(255,255,255,0.9)'
      g.lineWidth = 2
      g.beginPath()
      g.arc(cx, cy, r * 0.8, Math.PI * 1.05, Math.PI * 1.6)
      g.stroke()
    }
  }
  return c
}

let studTex = null
export function studTexture() {
  if (studTex) return studTex
  studTex = new CanvasTexture(paintStuds())
  studTex.wrapS = studTex.wrapT = RepeatWrapping
  studTex.colorSpace = SRGBColorSpace
  studTex.anisotropy = 8
  return studTex
}

const VERT_DECL = 'varying vec3 vTpPos;\nvarying vec3 vTpNrm;\n'
const VERT_BODY = `
  vec4 tpW = vec4(transformed, 1.0);
  vec3 tpN = objectNormal;
  #ifdef USE_INSTANCING
    tpW = instanceMatrix * tpW;
    tpN = mat3(instanceMatrix) * tpN;
  #endif
  tpW = modelMatrix * tpW;
  vTpPos = tpW.xyz;
  vTpNrm = normalize(mat3(modelMatrix) * tpN);
`
const FRAG_DECL = 'varying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform float tpScale;\n'
const FRAG_MAP = `
#ifdef USE_MAP
  vec3 tpA = abs(vTpNrm);
  vec2 tpUv = tpA.y > max(tpA.x, tpA.z) ? vTpPos.xz : (tpA.x > tpA.z ? vTpPos.zy : vTpPos.xy);
  vec4 sampledDiffuseColor = texture2D(map, tpUv * tpScale);
  diffuseColor *= sampledDiffuseColor;
#endif
`
function triplanar(shader, scale) {
  shader.uniforms.tpScale = { value: scale }
  shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_BODY)
  shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace('#include <map_fragment>', FRAG_MAP)
}

// Gives any MeshStandardMaterial with a map world-space (triplanar) UVs.
export function triplanarize(m, tile = LOBBY.studTile) {
  const scale = 1 / tile
  m.onBeforeCompile = (shader) => triplanar(shader, scale)
  m.customProgramCacheKey = () => 'stud-triplanar'
  return m
}

const cache = new Map()
// Studded plastic in `color`; tile = metres per 4x4-stud texture tile.
export function studMat(color, { tile = LOBBY.studTile, roughness = 0.55, emissive, emissiveIntensity } = {}) {
  const key = `${color}|${tile}|${roughness}|${emissive}|${emissiveIntensity}`
  if (cache.has(key)) return cache.get(key)
  const m = new MeshStandardMaterial({ color, map: studTexture(), roughness, metalness: 0 })
  if (emissive) {
    m.emissive.set(emissive)
    m.emissiveIntensity = emissiveIntensity ?? 0.3
  }
  const scale = 1 / tile
  m.onBeforeCompile = (shader) => triplanar(shader, scale)
  m.customProgramCacheKey = () => 'stud-triplanar'
  cache.set(key, m)
  return m
}
