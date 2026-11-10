// Prize / item art shared by the spin wheel, Daily Rewards, Trails and Worlds (SVG strings).
// Each *Art() returns a full <svg>; place() embeds one inside another SVG.
import { ICONS, bikeIcon } from './icons.js'

const INK = '#1d1238'

// An icon (an <svg viewBox="0 0 w h">) as a <g> placed in a box centred on (cx, cy).
export function place(svgStr, cx, cy, size) {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svgStr)?.[1].split(/\s+/).map(Number) ?? [0, 0, 64, 64]
  const k = size / Math.max(vb[2], vb[3])
  return `<g transform="translate(${cx - (vb[2] * k) / 2} ${cy - (vb[3] * k) / 2}) scale(${k})">${inner(svgStr)}</g>`
}
const inner = (svgStr) => svgStr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
const svg = (body, vb = '0 0 64 64', fit = '') => `<svg viewBox="${vb}"${fit ? ` preserveAspectRatio="${fit}"` : ''} aria-hidden="true" focusable="false">${body}</svg>`

// Running shoe (Speed rewards).
export function shoeArt(color = '#4aa8ff') {
  return svg(`<g transform="rotate(-28 32 34)">
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M6 44c0-7 2-13 6-17l9-9c3-3 8-3 10 1 3 6 9 10 16 11 9 1 13 6 13 11v3H6z" fill="${color}"/>
      <path d="M4 44h58v5c0 4-3 7-7 7H10c-4 0-6-3-6-7z" fill="#ffffff"/>
      <path d="M5 50h56" stroke-width="2"/>
    </g>
    <path d="M23 25l6 5M27 21l6 5M31 18l5 4" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M38 41c5-3 12-3 17 0" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M11 34c1-4 4-8 7-11" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>
  </g>`)
}

// Gold trophy over a pile of coins (Wins rewards).
export function winsArt() {
  const coin = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffc21f" stroke="${INK}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="none" stroke="#fff3a8" stroke-width="2"/>`
  return svg(`${place(ICONS.trophy, 32, 26, 44)}${coin(12, 52, 8)}${coin(26, 56, 7)}${coin(40, 56, 7)}${coin(53, 51, 8)}${coin(33, 47, 6)}`)
}

// Flame comet with white puffs (the wheel's trail slice).
export function cometArt(c1 = '#ff6a00', c2 = '#ffd21f') {
  return svg(`
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <path d="M12 52c4-16 16-30 34-38-4 7-4 11 0 13 6-4 9-9 11-17 7 16 3 33-11 41-11 6-24 6-34 1z" fill="${c1}"/>
      <path d="M22 49c5-9 12-15 22-20-2 6 0 9 4 9-2 8-8 13-16 14-4 1-7-1-10-3z" fill="${c2}" stroke-width="2.4"/>
      <circle cx="12" cy="48" r="8" fill="#fff"/><circle cx="22" cy="53" r="7" fill="#fff"/><circle cx="8" cy="39" r="6" fill="#fff"/>
    </g>
    <path d="M50 4l2.4 5.6L58 12l-5.6 2.4L50 20l-2.4-5.6L42 12l5.6-2.4z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`)
}

// Bike, optionally with wings behind it (Astral Wing).
export function bikeArt(def = {}, wings = false) {
  const wing = (dx, fill) =>
    `<path transform="translate(${dx} 0)" d="M56 40C46 20 26 8 6 10c8 5 10 9 6 13 9 0 13 4 8 8 11-1 17 2 15 7 8-1 14 0 21 2z" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
  const w = wings
    ? `${wing(10, '#7a2cff')}${wing(0, '#c58bff')}<path d="M18 14c10-1 20 3 28 10M20 22c8 0 15 3 20 8" stroke="#fff" stroke-width="2.5" fill="none" opacity=".6" stroke-linecap="round"/>`
    : ''
  return svg(`${w}<g transform="translate(0 ${wings ? 22 : 12})">${inner(bikeIcon(def))}</g>`, '0 0 120 96')
}

// --- Trails: a waving ribbon in the trail's colours with a little rider flying ahead ----------
const TRAIL_LOOKS = {
  rainbow: ['#ff3d3d', '#ff9d1f', '#ffe11f', '#5fe04c', '#21d8ff', '#3d6bff', '#c34dff'],
  flame: ['#ffe14a', '#ff9d1f', '#ff4a12', '#c41a00'],
  purple: ['#ff8ae6', '#c34dff', '#6b2bff', '#2a1a8a'],
  orange: ['#ffe14a', '#ffc21f', '#ff9d1f'],
  green: ['#d6ff4a', '#5fe04c', '#1fb04a'],
  blue: ['#9ff0ff', '#21c8ff', '#1f7bff'],
}
let uid = 0
export function trailArt(look = 'blue') {
  const id = `tr${uid++}`
  const cols = TRAIL_LOOKS[look] || TRAIL_LOOKS.blue
  const stops = cols.map((c, i) => `<stop offset="${i / (cols.length - 1)}" stop-color="${c}"/>`).join('')
  const extra =
    look === 'flame'
      ? `<path d="M14 40c2-8 8-10 6-18 6 4 8 10 6 16 3-2 4-6 3-9 5 5 5 13-1 17-6 4-13 1-14-6z" fill="#ffe14a" opacity=".9"/>`
      : look === 'purple'
        ? `<circle cx="18" cy="30" r="1.6" fill="#fff"/><circle cx="30" cy="40" r="1.2" fill="#fff"/><circle cx="24" cy="22" r="1" fill="#fff"/><circle cx="12" cy="44" r="1.2" fill="#fff"/>`
        : ''
  const star = (x, y, r) => `<path d="M${x} ${y - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}z" fill="#fff"/>`
  return svg(
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
    <path d="M4 26c8-10 18-12 26-6s18 4 24-2l6 30c-8 6-18 6-26 0S16 44 6 52z" fill="url(#${id})" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    ${extra}${star(24, 30, 6)}${star(40, 44, 4)}${star(14, 46, 3.5)}
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
      <rect x="58" y="34" width="10" height="14" rx="2" fill="#3fbf4a" transform="rotate(-24 63 41)"/>
      <rect x="52" y="20" width="16" height="16" rx="2.5" fill="#ff9a1f" transform="rotate(-24 60 28)"/>
      <rect x="66" y="16" width="7" height="13" rx="2" fill="#ffd21f" transform="rotate(30 69 22)"/>
      <rect x="54" y="4" width="15" height="15" rx="3" fill="#ffd21f" transform="rotate(-14 61 11)"/>
    </g>
    <ellipse cx="59.5" cy="11" rx="1.7" ry="2.4" fill="${INK}"/><ellipse cx="65" cy="9.6" rx="1.7" ry="2.4" fill="${INK}"/>
    <path d="M59 15c2 1.6 4.5 1.2 6-.6" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    '0 0 80 64',
  )
}

// Big green tick (claimed daily rewards).
export const checkArt = () =>
  svg(`<path d="M8 34l14 14L56 14" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 34l14 14L56 14" fill="none" stroke="#3fdc3a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 33l12 12" stroke="#b6ff9a" stroke-width="2.5" stroke-linecap="round"/>`)

// Rebirth swirl (header + buttons).
export const rebirthArt = () =>
  svg(`<circle cx="32" cy="32" r="26" fill="#fff" stroke="${INK}" stroke-width="3.5"/>
  <path d="M32 6a26 26 0 0 1 0 52" fill="#ff3d6e" stroke="${INK}" stroke-width="3.5"/>
  <circle cx="32" cy="32" r="13" fill="#5fc8ff" stroke="${INK}" stroke-width="3.5"/>
  <path d="M24 28c3-5 10-6 14-2" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`)

// --- Worlds: little landscape banners (viewBox 320 x 90) ---------------------------------------
export function worldArt(kind) {
  const W = 320
  const H = 90
  const cliffs = (side, base, top, cap, n) => {
    let out = ''
    for (let i = 0; i < n; i++) {
      const w = 34 - i * 4
      const h = 22 + i * 9
      const x = side < 0 ? i * 26 : W - i * 26 - w
      out += `<rect x="${x}" y="${H - h - i * 6}" width="${w + 24}" height="${h + i * 6 + 2}" fill="${i % 2 ? base : top}"/><rect x="${x}" y="${H - h - i * 6}" width="${w + 24}" height="5" fill="${cap}"/>`
    }
    return out
  }
  if (kind === 'jungle') {
    let trees = ''
    for (let i = 0; i < 12; i++) {
      const x = (i * 29 + 6) % W
      const y = 30 + ((i * 17) % 22)
      trees += `<rect x="${x + 7}" y="${y + 10}" width="5" height="${H - y}" fill="#3a2410"/><rect x="${x}" y="${y}" width="20" height="16" fill="${i % 2 ? '#1f7a2a' : '#2a9a34'}"/><rect x="${x + 4}" y="${y - 7}" width="12" height="9" fill="#3fbf4a"/>`
    }
    return svg(`<rect width="${W}" height="${H}" fill="#7fcf6a"/><rect width="${W}" height="40" fill="#bfe8a0"/>${trees}
      <path d="M140 ${H}L156 32h8l16 ${H - 32}z" fill="#a8743a"/><path d="M152 ${H}l6-58h4l6 58z" fill="#c4904a"/>
      ${cliffs(-1, '#2a5a1a', '#3a7a24', '#5fbf3a', 3)}${cliffs(1, '#2a5a1a', '#3a7a24', '#5fbf3a', 3)}`, `0 0 ${W} ${H}`, 'xMidYMid slice')
  }
  if (kind === 'lava') {
    let spikes = ''
    for (let i = 0; i < 14; i++) {
      const x = (i * 23 + 4) % W
      const h = 18 + ((i * 13) % 20)
      spikes += `<path d="M${x} ${H - 26}l7-${h} 7 ${h}z" fill="#1a1416"/><path d="M${x + 5} ${H - 26 - h * 0.6}l2-${h * 0.3} 2 ${h * 0.3}z" fill="#ffb020"/>`
    }
    return svg(`<rect width="${W}" height="${H}" fill="#2a1a2e"/><rect width="${W}" height="30" fill="#4a2a3a"/>${spikes}
      <path d="M130 ${H}L154 30h12l24 ${H - 30}z" fill="#ff4a12"/><path d="M150 ${H}l8-60h4l8 60z" fill="#ffb020"/>
      ${cliffs(-1, '#2a2226', '#3a3034', '#ff6a12', 3)}${cliffs(1, '#2a2226', '#3a3034', '#ff6a12', 3)}`, `0 0 ${W} ${H}`, 'xMidYMid slice')
  }
  // World 1: the orange hill lane between green-capped terraced cliffs
  return svg(`<rect width="${W}" height="${H}" fill="#8fd8ff"/><rect y="30" width="${W}" height="${H}" fill="#cfe8f5"/>
    <path d="M110 ${H}L152 18h16l42 ${H - 18}z" fill="#ff5a2a"/><path d="M140 ${H}l14-72h12l14 72z" fill="#ff7a3a"/>
    <path d="M120 ${H - 8}h80M128 ${H - 26}h64M136 ${H - 44}h48M144 ${H - 60}h32" stroke="#ffb08a" stroke-width="2"/>
    ${cliffs(-1, '#c4573a', '#e0703a', '#8ef03c', 4)}${cliffs(1, '#c4573a', '#e0703a', '#8ef03c', 4)}
    <rect x="34" y="8" width="16" height="12" fill="#3fbf4a"/><rect x="262" y="12" width="18" height="12" fill="#3fbf4a"/>`, `0 0 ${W} ${H}`, 'xMidYMid slice')
}

// Header chips (Pets): paw and backpack.
export const backpackArt = () =>
  svg(`<g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M22 14c0-6 4-9 10-9s10 3 10 9" fill="none" stroke-width="4"/>
    <rect x="10" y="14" width="44" height="44" rx="10" fill="#e8262e"/>
    <rect x="18" y="34" width="28" height="18" rx="5" fill="#ff5a5a"/>
    <path d="M24 24h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  </g>`)
