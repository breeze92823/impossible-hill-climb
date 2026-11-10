// Hand-drawn inline SVG icons for the HUD (flat cartoon fills + a dark ink outline).
// No <defs>/ids anywhere, so any number of copies can live in the page (hidden or not).

const INK = '#1d1238'
const S = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`

const svg = (body, vb = '0 0 64 64') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`

// Points of a 5-point star centred on (cx, cy).
function starPts(cx, cy, R, r) {
  const p = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? r : R
    p.push(`${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`)
  }
  return p.join(' ')
}

// Pie slices (equal) as SVG paths, clockwise from 12 o'clock.
function pie(cx, cy, r, colors) {
  const n = colors.length
  let out = ''
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n
    const a1 = a0 + (2 * Math.PI) / n
    const x0 = (cx + Math.cos(a0) * r).toFixed(2)
    const y0 = (cy + Math.sin(a0) * r).toFixed(2)
    const x1 = (cx + Math.cos(a1) * r).toFixed(2)
    const y1 = (cy + Math.sin(a1) * r).toFixed(2)
    out += `<path d="M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 ${n <= 2 ? 1 : 0} 1 ${x1} ${y1}z" fill="${colors[i]}"/>`
  }
  return out
}

export const ICONS = {
  trophy: svg(`
    <g ${S} stroke-width="3.5">
      <path d="M15 17H7v4c0 7 5 12 11 12M49 17h8v4c0 7-5 12-11 12" fill="none" stroke-width="4.5"/>
      <path d="M14 10h36v12c0 12-8 20-18 20S14 34 14 22z" fill="#ffc21f"/>
      <path d="M27 41h10v8H27z" fill="#f29a00"/>
      <rect x="17" y="48" width="30" height="9" rx="3" fill="#c46a00"/>
    </g>
    <path d="M19 14h5v15c-3-3-5-8-5-15z" fill="#fff" opacity=".6"/>
    <polygon points="${starPts(32, 24, 8, 3.4)}" fill="#fff6c8"/>`),

  gem: svg(`
    <path d="M15 8h34l12 16-29 34L3 24z" fill="#21d8ff"/>
    <path d="M15 8l8 16H3zM32 8l-9 16h18z" fill="#b6f7ff"/>
    <path d="M3 24h20l9 34z" fill="#8cecff"/>
    <path d="M41 24h20L32 58z" fill="#0aa6d8"/>
    <path d="M15 8h34l12 16-29 34L3 24z" fill="none" ${S} stroke="#0b3550" stroke-width="4"/>
    <path d="M3 24h58M15 8l8 16 9 34 9-34 8-16M23 24l9-16 9 16" fill="none" stroke="#0b3550" stroke-width="2.4" stroke-linejoin="round"/>`),

  shop: svg(`
    <g ${S} stroke-width="3.5">
      <rect x="10" y="24" width="44" height="34" rx="3" fill="#fff1d2"/>
      <rect x="16" y="36" width="13" height="22" fill="#3d9cff"/>
      <rect x="34" y="34" width="14" height="11" rx="2" fill="#bfeaff"/>
      <path d="M11 8h42l8 16H3z" fill="#fff"/>
    </g>
    <path d="M18 8h8l-3 16h-9zM34 8h8l5 16h-9z" fill="#ff3b5c"/>
    <path d="M11 8h42l8 16H3z" fill="none" ${S} stroke-width="3.5"/>
    <g ${S} stroke-width="3">
      <path d="M3 24a5.6 5.6 0 0 0 11.6 0z" fill="#ff3b5c"/>
      <path d="M14.6 24a5.8 5.8 0 0 0 11.6 0z" fill="#fff"/>
      <path d="M26.2 24a5.8 5.8 0 0 0 11.6 0z" fill="#ff3b5c"/>
      <path d="M37.8 24a5.8 5.8 0 0 0 11.6 0z" fill="#fff"/>
      <path d="M49.4 24a5.8 5.8 0 0 0 11.6 0z" fill="#ff3b5c"/>
    </g>
    <circle cx="25" cy="48" r="1.8" fill="${INK}"/>`),

  rebirth: svg(`
    <circle cx="32" cy="32" r="27" fill="#ffe14d" ${S} stroke-width="3.5"/>
    <circle cx="32" cy="32" r="21" fill="#ff9d1f"/>
    <g fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round">
      <path d="M18 30a14 14 0 0 1 23.5-8.5M46 34a14 14 0 0 1-23.5 8.5"/>
    </g>
    <g fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round">
      <path d="M48 27L37 25.5 46.5 15z"/><path d="M16 37l11 1.5L17.5 49z"/>
    </g>
    <g fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round">
      <path d="M18 30a14 14 0 0 1 23.5-8.5M46 34a14 14 0 0 1-23.5 8.5"/>
    </g>
    <g fill="#fff"><path d="M47 26.5L38 25.3 45.8 17z"/><path d="M17 37.5l9 1.2L18.2 47z"/></g>`),

  trails: svg(`
    <g fill="none" stroke-linecap="round">
      <path d="M4 52Q24 50 38 30" stroke="${INK}" stroke-width="11"/>
      <path d="M4 52Q24 50 38 30" stroke="#ff5fbf" stroke-width="6"/>
      <path d="M10 61Q32 58 44 38" stroke="${INK}" stroke-width="9"/>
      <path d="M10 61Q32 58 44 38" stroke="#38e1ff" stroke-width="4.5"/>
      <path d="M3 40Q18 38 30 22" stroke="${INK}" stroke-width="8"/>
      <path d="M3 40Q18 38 30 22" stroke="#8ef03c" stroke-width="3.5"/>
    </g>
    <polygon points="${starPts(45, 21, 16, 7)}" fill="#ffd21f" ${S} stroke-width="3.5"/>
    <polygon points="${starPts(43, 18, 5, 2)}" fill="#fff" opacity=".85"/>
    <polygon points="${starPts(12, 12, 6, 2.4)}" fill="#fff" ${S} stroke-width="2"/>`),

  pets: svg(`
    <g fill="#ff9a3c" ${S} stroke-width="3.5">
      <path d="M32 30c-9 0-18 9-18 17 0 6 5 9 10 8 3-.5 5-2.5 8-2.5s5 2 8 2.5c5 1 10-2 10-8 0-8-9-17-18-17z"/>
      <ellipse cx="13" cy="28" rx="6" ry="8" transform="rotate(-24 13 28)"/>
      <ellipse cx="24" cy="15" rx="6.2" ry="8.6" transform="rotate(-8 24 15)"/>
      <ellipse cx="40" cy="15" rx="6.2" ry="8.6" transform="rotate(8 40 15)"/>
      <ellipse cx="51" cy="28" rx="6" ry="8" transform="rotate(24 51 28)"/>
    </g>
    <g fill="#fff" opacity=".6">
      <ellipse cx="25" cy="38" rx="4" ry="2.4" transform="rotate(-30 25 38)"/>
      <ellipse cx="22" cy="11" rx="1.8" ry="3"/><ellipse cx="38" cy="11" rx="1.8" ry="3"/>
    </g>`),

  worlds: svg(`
    <circle cx="32" cy="32" r="26" fill="#2f9bff"/>
    <path d="M12 24c5-4 10-2 13 1s1 8-3 9-6 5-4 10c-5-4-8-12-6-20z" fill="#63e04c"/>
    <path d="M33 9c7 0 12 3 15 7-3 1-8 0-9 4s4 6 10 5c2 6 0 13-4 17-2-5-7-6-9-10s-5-6-3-10 0-9 0-13z" fill="#63e04c"/>
    <path d="M24 50c4-2 9-1 12 2-4 2-9 2-12-2z" fill="#63e04c"/>
    <path d="M14 20a22 22 0 0 1 12-10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>
    <circle cx="32" cy="32" r="26" fill="none" ${S} stroke-width="3.5"/>
    <path d="M4 40c10 8 46 0 56-18" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M4 40c10 8 46 0 56-18" fill="none" stroke="#ffd21f" stroke-width="3.5" stroke-linecap="round"/>`),

  pencil: svg(`
    <g transform="rotate(45 32 32)" ${S} stroke-width="3.5">
      <rect x="24" y="2" width="16" height="11" rx="4" fill="#ff7aa8"/>
      <rect x="24" y="13" width="16" height="5" fill="#d3dae6"/>
      <rect x="24" y="18" width="16" height="28" fill="#ffc21f"/>
      <path d="M24 46h16l-8 15z" fill="#ffe2b8"/>
      <path d="M29.6 56.5L32 61l2.4-4.5z" fill="${INK}"/>
    </g>
    <path d="M30.5 15.5l-14 14" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>`),

  inventory: svg(`
    <g ${S} stroke-width="3.5">
      <path d="M22 15c0-6 4-10 10-10s10 4 10 10" fill="none" stroke-width="4.5"/>
      <rect x="11" y="14" width="42" height="45" rx="12" fill="#ff6a3d"/>
      <path d="M11 30c8 4 34 4 42 0" fill="none"/>
      <rect x="18" y="36" width="28" height="18" rx="5" fill="#ffa071"/>
      <rect x="28.5" y="32" width="7" height="9" rx="2" fill="#ffd21f"/>
    </g>
    <path d="M17 24c2-3 5-5 9-5" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`),

  pranks: svg(`
    <g ${S} stroke-width="3.5">
      <path d="M15 22L9 5l15 9z" fill="#ff4f8b"/>
      <path d="M49 22l6-17-15 9z" fill="#ff4f8b"/>
      <circle cx="32" cy="36" r="24" fill="#9b4dff"/>
      <path d="M16 27l11 5M48 27l-11 5" fill="none" stroke-width="4"/>
      <ellipse cx="23" cy="36" rx="4.6" ry="4" fill="#fff"/>
      <ellipse cx="41" cy="36" rx="4.6" ry="4" fill="#fff"/>
      <path d="M18 44c6 9 22 9 28 0z" fill="#fff"/>
    </g>
    <circle cx="24" cy="37" r="2" fill="${INK}"/><circle cx="40" cy="37" r="2" fill="${INK}"/>
    <path d="M24 44v4M32 44v5M40 44v4" stroke="${INK}" stroke-width="2"/>
    <path d="M17 26a20 20 0 0 1 9-9" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>`),

  spin: svg(`
    <circle cx="32" cy="32" r="28" fill="#fff" ${S} stroke-width="3.5"/>
    ${pie(32, 32, 24, ['#ff3d6e', '#ff9d1f', '#ffd21f', '#63e04c', '#21d8ff', '#3d6bff', '#a64dff', '#ff5fbf'])}
    <circle cx="32" cy="32" r="24" fill="none" stroke="${INK}" stroke-width="2"/>
    <circle cx="32" cy="32" r="6" fill="#fff" ${S} stroke-width="3"/>
    <path d="M14 22a20 20 0 0 1 10-9" stroke="#fff" stroke-width="3.5" fill="none" opacity=".7" stroke-linecap="round"/>`),

  boulder: svg(`
    <path d="M12 41L7 26l11-14 16-7 17 7 8 16-4 19-15 10-18-2z" fill="#aab4c4" ${S} stroke-width="4"/>
    <path d="M18 12l8 14 8-21M26 26H7M26 26l14 10 19-8M40 36v20M26 26l-4 28" fill="none" stroke="#6c7889" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M19 16l6 9 6-14z" fill="#fff" opacity=".55"/>
    <path d="M44 17l-3 8 10 2z" fill="#fff" opacity=".3"/>
    <path d="M12 41L7 26l11-14 16-7 17 7 8 16-4 19-15 10-18-2z" fill="none" ${S} stroke-width="4"/>`),

  close: svg(`
    <path d="M18 18l28 28M46 18L18 46" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
    <path d="M18 18l28 28M46 18L18 46" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`),

  lock: svg(`
    <path d="M20 28v-7a12 12 0 0 1 24 0v7" fill="none" stroke="${INK}" stroke-width="10"/>
    <path d="M20 28v-7a12 12 0 0 1 24 0v7" fill="none" stroke="#d3dae6" stroke-width="5"/>
    <rect x="12" y="27" width="40" height="31" rx="7" fill="#ffc21f" ${S} stroke-width="3.5"/>
    <circle cx="32" cy="40" r="4" fill="${INK}"/><path d="M32 42v8" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`),

  check: svg(`
    <path d="M12 34l13 13 27-29" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 34l13 13 27-29" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),

  plus: svg(`
    <path d="M32 12v40M12 32h40" stroke="${INK}" stroke-width="17" stroke-linecap="round"/>
    <path d="M32 12v40M12 32h40" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`),

  bolt: svg(`<path d="M38 3L10 36h18l-6 25 32-36H36z" fill="#ffd21f" ${S} stroke-width="3.5"/>
    <path d="M33 10L19 31h6" fill="none" stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`),

  star: svg(`<polygon points="${starPts(32, 34, 28, 12)}" fill="#ffd21f" ${S} stroke-width="3.5"/>`),

  none: svg(`<circle cx="32" cy="32" r="22" fill="#fff" ${S} stroke-width="4"/><path d="M17 47L47 17" stroke="#ff3b5c" stroke-width="6" stroke-linecap="round"/>`),
}

// Calendar with today's day number.
export function calendarIcon(day) {
  return svg(`
    <g ${S} stroke-width="3.5">
      <rect x="6" y="12" width="52" height="47" rx="9" fill="#fff"/>
      <path d="M6 21a9 9 0 0 1 9-9h34a9 9 0 0 1 9 9v7H6z" fill="#ff3d6e"/>
      <rect x="16" y="4" width="7" height="14" rx="3.5" fill="#d3dae6"/>
      <rect x="41" y="4" width="7" height="14" rx="3.5" fill="#d3dae6"/>
    </g>
    <text x="32" y="53" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="25" fill="${INK}">${day}</text>`)
}

// Stylized motorcycle side view tinted with a bike's colors.
export function bikeIcon(def) {
  const body = def.body || '#ff3b5c'
  const accent = def.accent || '#ffffff'
  const rim = def.rim || '#d3dae6'
  const glow = def.neon ? `<ellipse cx="60" cy="66" rx="50" ry="4" fill="${def.neon}" opacity=".55"/>` : ''
  const long = def.style === 'chopper' || def.style === 'cruiser'
  const scooter = def.style === 'scooter'
  const frame = scooter
    ? `<path d="M30 50h38l8-30h10" fill="none" stroke-width="5"/>
       <path d="M22 44c0-10 8-16 18-16h22l6 22H34c-6 0-12-1-12-6z" fill="${body}"/>
       <path d="M30 28c4-6 14-7 20-3l-2 4H30z" fill="${accent}"/>
       <path d="M76 20c4-8 10-9 14-7" fill="none" stroke-width="5"/>`
    : `<path d="M26 52L44 40M${long ? '96 52L80 18' : '94 52L84 24'}" fill="none" stroke-width="5"/>
       <path d="M28 38l14-11h20l15-10h12l6 10-8 9H67l-10 12H40z" fill="${body}"/>
       <path d="M38 30c6-7 18-7 24-3l-3 6H38z" fill="${accent}"/>
       <path d="M78 17l-3-8h9" fill="none" stroke-width="4"/>
       <rect x="44" y="40" width="14" height="9" rx="2" fill="#5b6475"/>`
  return svg(
    `${glow}
    <g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <circle cx="26" cy="52" r="${scooter ? 12 : 15}" fill="#25232e"/><circle cx="26" cy="52" r="${scooter ? 6 : 8}" fill="${rim}"/>
      <circle cx="94" cy="52" r="${scooter ? 12 : 15}" fill="#25232e"/><circle cx="94" cy="52" r="${scooter ? 6 : 8}" fill="${rim}"/>
      ${frame}
    </g>
    <path d="${scooter ? 'M30 34c3-3 8-4 12-4' : 'M48 30h12l8-6'}" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>`,
    '0 0 120 72',
  )
}

// Egg used by the hatch reveal; crack lines are a separate group the CSS shows.
export function eggIcon(egg) {
  const spots = egg.spots || '#c9a46a'
  return svg(
    `<path d="M50 6C29 6 12 40 12 62c0 20 17 32 38 32s38-12 38-32C88 40 71 6 50 6z" fill="${egg.color || '#f4ead2'}" ${S} stroke-width="5"/>
    <g fill="${spots}"><circle cx="34" cy="38" r="7"/><circle cx="62" cy="28" r="5"/><circle cx="70" cy="58" r="8"/><circle cx="30" cy="70" r="6"/><circle cx="52" cy="80" r="5"/></g>
    <path d="M30 26c4-8 10-13 16-14" stroke="#fff" stroke-width="6" fill="none" opacity=".6" stroke-linecap="round"/>
    <path class="hud-crack" d="M14 56l12-7 9 9 10-10 9 9 10-9 9 8 13-6" fill="none" ${S} stroke-width="4"/>
    <path d="M50 6C29 6 12 40 12 62c0 20 17 32 38 32s38-12 38-32C88 40 71 6 50 6z" fill="none" ${S} stroke-width="5"/>`,
    '0 0 100 100',
  )
}

// Cute pet face for cards and the hatch reveal; ears/details follow def.kind
// (dogs: def.ears 'butterfly' | 'floppy' | 'bat' | 'pointy', def.fluffy, def.bow).
export function petIcon(def) {
  const c = def?.color || '#ffffff'
  const s = def?.spot || '#ffb3c7'
  const k = def?.kind
  const lum = (h) => {
    const n = parseInt(String(h).slice(1, 7), 16)
    return Number.isNaN(n) ? 1 : (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255
  }
  const N = 'stroke="none"'
  const mirror = (body) => `${body}<g transform="matrix(-1 0 0 1 64 0)">${body}</g>`
  // eye pair at (lx|rx, y), scale r; whites = white rims for dark faces/patches
  const eyePair = (lx, rx, y, r = 1, whites = lum(c) < 0.3) => {
    let o = ''
    for (const x of [lx, rx]) {
      if (whites) o += `<ellipse cx="${x}" cy="${y}" rx="${5.6 * r}" ry="${6.4 * r}" fill="#fff" ${S} stroke-width="2"/>`
      o += `<ellipse cx="${x}" cy="${y}" rx="${3.6 * r}" ry="${4.6 * r}" fill="${INK}"/><circle cx="${x + 1.4 * r}" cy="${y - 1.8 * r}" r="${1.5 * r}" fill="#fff"/>`
    }
    return o
  }
  const smile = (x = 32, y = 46) => `<path d="M${x - 4} ${y}c2 2.5 6 2.5 8 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
  const blushAt = (pts) => pts.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.4" fill="#ff7aa8" opacity=".5"/>`).join('')
  const nose = (y = 41.5) => `<ellipse cx="32" cy="${y}" rx="4.2" ry="3" fill="${INK}" ${N}/>`
  let back = ''
  let face = `<ellipse cx="32" cy="36" rx="24" ry="22" fill="${c}" ${S} stroke-width="3.5"/>`
  let front = ''
  let outline = '' // face outline redrawn over markings that hug the edge
  let eyes = null
  let mouth = null
  let blush = blushAt([[15, 44], [49, 44]])
  let extra = ''
  let shine = `<path d="M14 28a20 20 0 0 1 9-9" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`
  if (k === 'dog') {
    const e = def.ears
    if (e === 'butterfly') {
      // wide fringed fans flaring sideways (butterfly wings)
      back = mirror(
        `<path d="M27 19L16 30Q9 31 3 26Q4 22 1 19Q4 15 1 11Q5 9 4 4Q9 5 11 1Q16 5 20 7Q24 12 27 19z" fill="${s}"/><path d="M24 19L16 26Q10 26 6 23Q7 19 5 16Q8 13 7 9Q11 9 13 6Q19 11 24 19z" fill="#ffb3c7" ${N}/>`,
      )
      front = mirror(`<ellipse cx="21" cy="32" rx="9" ry="10.5" fill="${s}" ${N}/>`) + nose()
      eyes = eyePair(23, 41, 35, 1, true)
    } else if (e === 'floppy') {
      const bottom = def.fluffy ? 52 : 46
      // lighter muzzle (white blended into the coat) so dark breeds still read
      const n = parseInt(c.slice(1, 7), 16)
      const mix = (v) => Math.round(v + (255 - v) * 0.35)
      const muzzle = Number.isNaN(n) ? '#ffffff' : `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
      front =
        `<ellipse cx="32" cy="45" rx="11" ry="8" fill="${muzzle}" ${N}/>` +
        mirror(`<path d="M20 15C11 12 4 19 4 31c0 ${bottom - 37} 3 ${bottom - 31} 8 ${bottom - 31}s7-7 8-15c.5-5 .5-11 0-16z" fill="${s}" ${S} stroke-width="3"/>`) +
        nose()
      eyes = eyePair(25, 39, 35)
    } else if (e === 'bat') {
      back = mirror(`<path d="M12 32L5 2l23 15z" fill="${c}"/><path d="M12 24L9 9l12 9z" fill="#ff9fbd" ${N}/>`)
      front = `<path d="M29 13h6l2 20c7 1 12 6 12 12 0 7-8 11-17 11s-17-4-17-11c0-6 5-11 12-12z" fill="${s}" ${N}/>` + nose()
    } else if (e === 'pointy') {
      back = mirror(`<path d="M11 30l3-22 17 12z" fill="${c}"/><path d="M14 24l1.5-11 9 6.5z" fill="${s}" ${N}/>`)
      front = `<path d="M9 40c5-5 12-5 16-2 3 2 5 3 7 3s4-1 7-3c4-3 11-3 16 2-2 11-11 18-23 18S11 51 9 40z" fill="${s}" ${N}/>` + mirror(`<ellipse cx="22" cy="26" rx="3" ry="2" fill="${s}" ${N}/>`) + nose()
    } else {
      back = `<ellipse cx="13" cy="30" rx="8" ry="15" fill="${s}" transform="rotate(18 13 30)"/><ellipse cx="51" cy="30" rx="8" ry="15" fill="${s}" transform="rotate(-18 51 30)"/>`
      front = `<ellipse cx="41" cy="30" rx="8" ry="7" fill="${s}" stroke="none"/>`
    }
    if (def.fluffy) back = `<circle cx="24" cy="17" r="8" fill="${c}"/><circle cx="40" cy="17" r="8" fill="${c}"/><circle cx="32" cy="13" r="8.5" fill="${c}"/>` + back
    if (def.bow) {
      const [bx, by] = def.fluffy ? [32, 8] : [44, 15]
      extra = `<g ${S} stroke-width="2.2" transform="translate(${bx} ${by})"><path d="M0 0L-9-6v12zM0 0l9-6v12z" fill="${def.bow}"/><circle r="3.2" fill="${def.bow}"/></g>`
    }
  } else if (k === 'chicken') {
    back = `<path d="M20 20c-3-8 3-13 8-9 0-7 9-8 10-1 5-5 12-1 8 7z" fill="${s}"/>`
    front = `<path d="M29 45c-1 6 1 10 3 10s4-4 3-10z" fill="${s}"/><path d="M25 40l7-5 7 5-7 6z" fill="#ffb020"/><path d="M25 40h14" fill="none"/>`
    eyes = eyePair(22, 42, 32)
    mouth = ''
  } else if (k === 'cow') {
    back = mirror(`<path d="M17 20c-4-4-5-10-2-14 2 4 5 7 9 8z" fill="#f6ead0"/><ellipse cx="9" cy="30" rx="9" ry="5" fill="${c}" transform="rotate(20 9 30)"/>`)
    front = `<path d="M35 14.2A24 22 0 0 1 54 27.2c-6 1-10-3-14-2s-7-5-5-11z" fill="${s}" ${N}/><ellipse cx="32" cy="47" rx="15" ry="9.5" fill="#ffb3c0"/>` + mirror(`<ellipse cx="26.5" cy="47" rx="2.2" ry="3" fill="${INK}" ${N}/>`)
    outline = `<ellipse cx="32" cy="36" rx="24" ry="22" fill="none" ${S} stroke-width="3.5"/>`
    eyes = eyePair(23, 41, 33)
    mouth = ''
    blush = ''
  } else if (k === 'goat') {
    back = mirror(
      `<path d="M24 18C20 8 12 4 6 9" fill="none" stroke-width="9"/><path d="M24 18C20 8 12 4 6 9" fill="none" stroke="${s}" stroke-width="4.5"/><ellipse cx="8" cy="32" rx="9" ry="4.5" fill="${c}" transform="rotate(25 8 32)"/>`,
    ) + `<path d="M26 50l6 13 6-13z" fill="${s}"/>`
    front = `<path d="M29 41h6l-3 3z" fill="${INK}"/>`
  } else if (k === 'horse') {
    face = `<ellipse cx="32" cy="36" rx="19" ry="24" fill="${c}" ${S} stroke-width="3.5"/>`
    back = mirror(`<path d="M17 22l1-17 10 11z" fill="${c}"/>`)
    front = `<path d="M30 22h4l2 18h-8z" fill="#fff" ${N}/><ellipse cx="32" cy="50" rx="14" ry="9" fill="#c8956b"/>` + mirror(`<ellipse cx="26.5" cy="50" rx="2" ry="2.8" fill="${INK}" ${N}/>`) + `<path d="M24 15c0-6 4-9 8-9s8 3 8 9c-3 4-6 6-8 10-2-4-5-6-8-10z" fill="${s}"/>`
    eyes = eyePair(22, 42, 34)
    mouth = ''
    blush = ''
    shine = `<path d="M17 30a19 19 0 0 1 4-11" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`
  } else if (k === 'bull') {
    back = mirror(`<path d="M16 24C6 24 1 16 3 5c3 6 7 9 15 10z" fill="#f6ead0"/><ellipse cx="9" cy="32" rx="8" ry="4.5" fill="${c}" transform="rotate(15 9 32)"/>`)
    front = `<path d="M24 17c2-6 6-8 8-4 2-4 6-2 8 4z" fill="${s}"/><ellipse cx="32" cy="47" rx="15" ry="9.5" fill="#c48a6a"/>` + mirror(`<ellipse cx="26.5" cy="46" rx="2.2" ry="3" fill="${INK}" ${N}/>`) + `<circle cx="32" cy="54.5" r="4.5" fill="none" stroke-width="4.6"/><circle cx="32" cy="54.5" r="4.5" fill="none" stroke="#ffcf3a" stroke-width="2.4"/>`
    eyes = eyePair(23, 41, 33)
    mouth = `<path d="M15 25l11 4M49 25l-11 4" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`
    blush = ''
  } else if (k === 'llama') {
    face = `<ellipse cx="32" cy="38" rx="19" ry="21" fill="${c}" ${S} stroke-width="3.5"/>`
    back = mirror(`<path d="M19 24C13 16 13 6 17 2c4 4 6 12 6 20z" fill="${c}"/>`)
    front = `<circle cx="25" cy="20" r="6"/><circle cx="39" cy="20" r="6"/><circle cx="32" cy="17" r="6.5"/>`.replace(/\/>/g, ` fill="${s}"/>`) + `<ellipse cx="32" cy="49" rx="11" ry="8" fill="${s}"/><path d="M29 45.5h6l-3 3z" fill="${INK}"/>`
    eyes = eyePair(24, 40, 36, 0.9)
    mouth = `<path d="M32 48.5v3M28 51.5c2 2 4 2 4 0 0 2 2 2 4 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
    blush = blushAt([[18, 45], [46, 45]])
  } else if (k === 'seahorse') {
    face = ''
    back = `<path d="M22 9l3-7 4 6 3-7 3 8z" fill="${s}"/><path d="M20 34c-8 0-10 8-8 14 4 0 8-3 10-6z" fill="${s}"/>`
    front =
      `<path d="M28 52c0 8-10 10-12 4-1-4 3-6 5-3" fill="none" stroke-width="10"/>` +
      `<path d="M28 52c0 8-10 10-12 4-1-4 3-6 5-3" fill="none" stroke="${c}" stroke-width="5.5"/>` +
      `<ellipse cx="30" cy="40" rx="11" ry="14" fill="${c}" stroke-width="3.5"/><path d="M34 32h6M35 38h6M34 44h6" stroke="${s}" stroke-width="2.6"/>` +
      `<path d="M40 16h14a4.5 4.5 0 0 1 0 9H40z" fill="${c}" stroke-width="3"/><rect x="52" y="15.5" width="6" height="9" rx="3" fill="${s}" stroke-width="2.4"/>` +
      `<circle cx="30" cy="20" r="13" fill="${c}" stroke-width="3.5"/>`
    eyes = eyePair(25, 36, 19, 0.8)
    mouth = ''
    blush = blushAt([[21, 26], [39, 26]])
    shine = `<path d="M21 14a10 10 0 0 1 5-5" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`
  } else if (k === 'pufferfish') {
    let spikes = ''
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2
      const p = (ang, r) => `${(32 + Math.cos(ang) * r).toFixed(1)},${(35 + Math.sin(ang) * r).toFixed(1)}`
      spikes += `<polygon points="${p(a - 0.17, 20)} ${p(a, 30)} ${p(a + 0.17, 20)}" fill="${s}"/>`
    }
    back = spikes + mirror(`<ellipse cx="8" cy="42" rx="5" ry="7" fill="${s}" transform="rotate(-25 8 42)"/>`)
    face = `<circle cx="32" cy="35" r="22" fill="${c}" ${S} stroke-width="3.5"/>`
    front = `<path d="M10.6 40.1A22 22 0 0 0 53.4 40.1Q32 46 10.6 40.1z" fill="#fff6dc" ${N}/>` + [[22, 20, 2.2], [32, 17, 2.4], [42, 20, 2.2], [27, 25, 1.6], [37, 25, 1.6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${s}" ${N}/>`).join('')
    outline = `<circle cx="32" cy="35" r="22" fill="none" ${S} stroke-width="3.5"/>`
    eyes = eyePair(23, 41, 34, 1.1)
    mouth = `<ellipse cx="32" cy="46" rx="4" ry="3.4" fill="#ff8a8a" ${S} stroke-width="2.2"/><ellipse cx="32" cy="46.4" rx="1.6" ry="1.4" fill="${INK}"/>`
  } else if (k === 'shark') {
    back = `<path d="M26 18L36 1l8 19z" fill="${c}"/>` + mirror(`<path d="M12 46L1 58l17-6z" fill="${c}"/>`)
    face = `<ellipse cx="32" cy="36" rx="26" ry="20" fill="${c}" ${S} stroke-width="3.5"/>`
    front = `<path d="M7.5 42.7A26 20 0 0 0 56.5 42.7Q32 50 7.5 42.7z" fill="${s}" ${N}/><path d="M11 30v7M14.5 29v8" fill="none"/>`
    outline = `<ellipse cx="32" cy="36" rx="26" ry="20" fill="none" ${S} stroke-width="3.5"/>`
    eyes = eyePair(22, 42, 32)
    mouth = `<path d="M20 44q12 9 24 0z" fill="${INK}"/>` + [24, 29, 34, 39].map((x) => `<path d="M${x} 44.4l2.5 3.4 2.5-3.4z" fill="#fff"/>`).join('')
    blush = blushAt([[13, 41], [51, 41]])
  } else if (k === 'kraken') {
    const arm = (d) => `<path d="${d}" fill="none" stroke-width="10"/><path d="${d}" fill="none" stroke="${c}" stroke-width="5.5"/>`
    back =
      arm('M16 42C8 44 5 54 10 58c3 2 6-1 4-4') +
      arm('M24 47c-4 6-3 13 2 14 3 0 4-3 2-5') +
      arm('M40 47c4 6 3 13-2 14-3 0-4-3-2-5') +
      arm('M48 42c8 2 11 12 6 16-3 2-6-1-4-4') +
      arm('M32 49c0 5 2 9 5 11') +
      [[8, 52], [56, 52], [22, 56], [42, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${s}" ${N}/>`).join('')
    face = `<path d="M10 40C8 18 18 6 32 6s24 12 22 34c-2 8-10 12-22 12S12 48 10 40z" fill="${c}" ${S} stroke-width="3.5"/>`
    front = [[22, 16, 3], [40, 13, 2.5], [46, 24, 2.2], [17, 27, 2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${s}" ${N}/>`).join('')
    eyes = eyePair(24, 40, 32, 1.15, true)
    mouth = smile(32, 43)
    shine = `<path d="M15 24a18 18 0 0 1 7-11" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`
  } else if (k === 'stingray') {
    back = `<path d="M32 46c0 8 4 12 10 16" fill="none" stroke-width="6"/><path d="M32 46c0 8 4 12 10 16" fill="none" stroke="${c}" stroke-width="2.6"/><path d="M36 55l5-1-2 5z" fill="${s}" stroke-width="2"/>`
    face = `<path d="M32 10C40 10 52 22 62 34 50 38 40 46 32 48 24 46 14 38 2 34 12 22 24 10 32 10z" fill="${c}" ${S} stroke-width="3.5"/>`
    front = [[14, 32, 2.2], [50, 32, 2.2], [21, 26, 1.8], [43, 26, 1.8], [24, 38, 1.6], [40, 38, 1.6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${s}" ${N}/>`).join('')
    eyes = eyePair(26, 38, 28, 0.85)
    mouth = smile(32, 37)
    blush = blushAt([[20, 33], [44, 33]])
    shine = `<path d="M22 20a20 20 0 0 1 7-6" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`
  } else if (k === 'cat') {
    back = `<path d="M10 28L12 6l18 12z" fill="${c}"/><path d="M54 28L52 6 34 18z" fill="${c}"/><path d="M15 22l1-10 8 6z" fill="${s}" stroke="none"/><path d="M49 22l-1-10-8 6z" fill="${s}" stroke="none"/>`
  } else if (k === 'bunny') {
    back = `<ellipse cx="22" cy="12" rx="7" ry="16" fill="${c}"/><ellipse cx="42" cy="12" rx="7" ry="16" fill="${c}"/><ellipse cx="22" cy="13" rx="3" ry="10" fill="${s}" stroke="none"/><ellipse cx="42" cy="13" rx="3" ry="10" fill="${s}" stroke="none"/>`
  } else if (k === 'pig') {
    back = `<path d="M12 24l2-14 13 8z" fill="${s}"/><path d="M52 24l-2-14-13 8z" fill="${s}"/>`
    front = `<ellipse cx="32" cy="42" rx="9" ry="6" fill="${s}"/><circle cx="29" cy="42" r="1.8" fill="${INK}" stroke="none"/><circle cx="35" cy="42" r="1.8" fill="${INK}" stroke="none"/>`
  } else if (k === 'fox') {
    back = `<path d="M8 30L10 4l20 14z" fill="${c}"/><path d="M56 30L54 4 34 18z" fill="${c}"/><path d="M11 12l-1-8 6 4z" fill="${s}" stroke="none"/><path d="M53 12l1-8-6 4z" fill="${s}" stroke="none"/>`
    front = `<path d="M14 40c6 2 12 4 18 12 6-8 12-10 18-12-4 12-10 18-18 18s-14-6-18-18z" fill="${s}" stroke="none"/>`
  } else if (k === 'panda') {
    back = `<circle cx="15" cy="15" r="9" fill="${s}"/><circle cx="49" cy="15" r="9" fill="${s}"/>`
    front = `<ellipse cx="23" cy="34" rx="7" ry="9" fill="${s}" stroke="none" transform="rotate(25 23 34)"/><ellipse cx="41" cy="34" rx="7" ry="9" fill="${s}" stroke="none" transform="rotate(-25 41 34)"/>`
  } else if (k === 'crab') {
    back = `<path d="M10 40C2 34 2 22 9 18l6 8-5 3 7 4z" fill="${c}"/><path d="M54 40c8-6 8-18 1-22l-6 8 5 3-7 4z" fill="${c}"/><path d="M24 22v-12M40 22v-12" fill="none"/><circle cx="24" cy="10" r="5" fill="#fff"/><circle cx="40" cy="10" r="5" fill="#fff"/>`
    front = `<circle cx="24" cy="10" r="2.2" fill="${INK}" stroke="none"/><circle cx="40" cy="10" r="2.2" fill="${INK}" stroke="none"/><circle cx="22" cy="46" r="3" fill="${s}" stroke="none"/><circle cx="42" cy="46" r="3" fill="${s}" stroke="none"/>`
  } else if (k === 'dragon') {
    back = `<path d="M18 20L10 2l16 12z" fill="${s}"/><path d="M46 20l8-18-16 12z" fill="${s}"/><path d="M6 36L0 22l12 6z" fill="${s}"/><path d="M58 36l6-14-12 6z" fill="${s}"/>`
    front = `<path d="M26 14l6-6 6 6" fill="none" stroke="${s}" stroke-width="3"/><circle cx="28" cy="46" r="1.6" fill="${INK}" stroke="none"/><circle cx="36" cy="46" r="1.6" fill="${INK}" stroke="none"/>`
  } else {
    back = `<circle cx="15" cy="15" r="8" fill="${c}"/><circle cx="49" cy="15" r="8" fill="${c}"/>`
  }
  if (eyes === null) eyes = k === 'crab' ? '' : eyePair(23, 41, 35)
  if (mouth === null) mouth = k === 'pig' ? '' : smile()
  return svg(`
    <g ${S} stroke-width="3">${back}</g>
    ${face}
    <g ${S} stroke-width="2">${front}</g>
    ${outline}${eyes}${mouth}${extra}
    ${blush}
    ${shine}`)
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
export const esc = escapeXml
