// HUD modal panels (one open at a time): Shop, Rebirth, Trails, Pets, Worlds,
// Inventory, Pranks, Daily, Custom Speed and the gem shop (the spin wheel is its own
// overlay, spinwheel.js). Panels only
// read `state` and call state.js actions; they re-render when their signature
// (the bits of state they show) changes, checked a few times per second.
import { ALL_BIKES, BIKES, DAILY_REWARDS, ECONOMY, FEATURED_BIKES, PET_LIMITS, PETS, PRIZE_BIKES, TRAILS, WORLD_BIKES, WORLDS } from '../config.js'
import {
  bikeUnlocked,
  buyFeaturedBike,
  buyTrail,
  claimDaily,
  dailyIndex,
  dailyReadyIn,
  deletePet,
  equipBest,
  equipBike,
  fmt,
  maxLevel,
  petMult,
  premium,
  rebirth,
  rebirthMult,
  setCustomSpeed,
  setTrail,
  skipRebirth,
  state,
  togglePet,
  trailOwned,
  travelTo,
  unequipAll,
} from '../game/state.js'
import { ICONS, bikeIcon, calendarIcon, esc, petIcon } from './icons.js'
import { backpackArt, bikeArt, checkArt, rebirthArt, shoeArt, trailArt, winsArt, worldArt } from './prizeart.js'

export const RARITY = {
  Common: '#e3e9f2',
  Uncommon: '#63e04c',
  Rare: '#38b6ff',
  Epic: '#c56bff',
  Legendary: '#ffb020',
  Mythic: '#ff3d6e',
}
export const rarityColor = (r) => RARITY[r] || '#ffffff'

const GEM_PACKS = [
  { gems: 50 },
  { gems: 120 },
  { gems: 300, tag: 'POPULAR' },
  { gems: 750 },
  { gems: 2000, tag: 'BEST VALUE' },
]
const ALL_SHOP = [...[...WORLD_BIKES].reverse(), ...FEATURED_BIKES, ...PRIZE_BIKES, ...BIKES] // inventory order (best first)

// --- DOM helpers (shared with hud.js) ----------------------------------------------
export function h(tag, cls = '', html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}

// Press feedback that also works on iOS (where :active needs a touch listener).
export function pressable(el) {
  const up = () => el.classList.remove('is-pressed')
  el.addEventListener('pointerdown', () => el.classList.add('is-pressed'))
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('pointerleave', up)
  return el
}

// A <button> that runs fn on click (keyboard + touch + mouse), never submits.
export function btn(cls, html, fn) {
  const b = h('button', cls, html)
  b.type = 'button'
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    fn(e, b)
  })
  return pressable(b)
}

export function setText(el, v) {
  if (el._t !== v) {
    el._t = v
    el.textContent = v
  }
}

export function clock(s) {
  s = Math.max(0, Math.ceil(s))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n) => String(n).padStart(2, '0')
  return hh > 0 ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`
}

const i = (name, cls = 'hud-i') => `<span class="${cls}">${ICONS[name]}</span>`
const winsLabel = (n) => `${i('trophy')}${fmt(n)} Wins`
const gemsLabel = (n) => `${i('gem')}${fmt(n)}`

const commas = (n) => Math.round(n).toLocaleString('en-US')
export const multText = (m) => `x${parseFloat((m ?? 1).toFixed(2))}`
// "2:54:02" / "1d 2:54:02"
export function dhms(s) {
  s = Math.max(0, Math.ceil(s))
  const d = Math.floor(s / 86400)
  const hh = Math.floor((s % 86400) / 3600)
  const p = (n) => String(n).padStart(2, '0')
  const t = `${hh}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
  return d > 0 ? `${d}d ${t}` : t
}
const shoeIcon = () => `<span class="hud-shoe">${shoeArt('#5fb8ff')}</span>`

// A square pet tile: name on top, picture, footer (multiplier or chance); a tick when equipped.
// Used by the Pets panel, the inventory and the egg popup.
export function petTile(def, { foot = '', check = false, sel = false, onTap = null, big = false } = {}) {
  const long = (def?.name ?? '').length > 10 ? ' is-long' : ''
  const cls = `hud-pt${check ? ' is-on' : ''}${sel ? ' is-sel' : ''}${big ? ' is-big' : ''}${long}`
  const html = `<span class="hud-pt-name hud-ol">${esc(def?.name ?? '?')}</span><span class="hud-pt-img">${petIcon(def)}</span><span class="hud-pt-foot hud-ol">${foot}</span>${check ? `<span class="hud-pt-check">${checkArt()}</span>` : ''}`
  const el = onTap ? btn(cls, html, onTap) : h('div', cls, html)
  el.style.setProperty('--rar', rarityColor(def?.rarity))
  return el
}
export const petFoot = (def) => `${shoeIcon()}${multText(def?.mult)}`
const sortedPets = () =>
  [...state.pets].sort((a, b) => {
    const ea = state.equippedPets.includes(a.uid) ? 1 : 0
    const eb = state.equippedPets.includes(b.uid) ? 1 : 0
    return eb - ea || (PETS[b.id]?.mult ?? 1) - (PETS[a.id]?.mult ?? 1) || a.uid - b.uid
  })

// --- Cards ---------------------------------------------------------------------------
function bikeCard(def, { inventory = false } = {}) {
  const equipped = state.bike === def.id
  const owned = state.ownedBikes.includes(def.id)
  const unlocked = bikeUnlocked(def)
  const card = h('div', `hud-item${equipped ? ' is-on' : ''}${unlocked ? '' : ' is-locked'}${def.featured ? ' is-featured' : ''}`)
  if (def.ring) card.style.setProperty('--ring', def.ring)
  if (def.tag && !inventory) card.appendChild(h('div', 'hud-tag hud-ol', esc(def.tag)))
  card.appendChild(h('div', 'hud-thumb', bikeIcon(def)))
  card.appendChild(h('div', 'hud-item-name', esc(def.name)))
  card.appendChild(h('div', 'hud-item-stat', `+${fmt(def.perSpeed)}/Speed`))
  if (!inventory) {
    let price = def.wins ? winsLabel(def.wins) : 'Free'
    if (def.stock) price += `<span class="hud-stock">${fmt(def.sold ?? 0)}/${fmt(def.stock)} sold</span>`
    card.appendChild(h('div', 'hud-item-price', price))
  }
  let b
  if (equipped) b = btn('hud-btn hud-c-green', 'Equipped', () => {})
  else if (unlocked) b = btn('hud-btn hud-c-blue', 'Equip', () => equipBike(def.id))
  else if (def.featured && !owned) b = btn('hud-btn hud-c-gold', `Buy ${winsLabel(def.wins)}`, () => buyFeaturedBike(def.id))
  else b = btn('hud-btn hud-c-gray', `${i('lock')}Locked`, () => equipBike(def.id))
  card.appendChild(b)
  return card
}

function petsGrid() {
  const grid = h('div', 'hud-pets2-grid')
  for (const p of sortedPets()) {
    const def = PETS[p.id]
    grid.appendChild(petTile(def, { foot: petFoot(def), check: state.equippedPets.includes(p.uid), onTap: () => togglePet(p.uid) }))
  }
  return grid
}

function section(title) {
  return h('div', 'hud-section hud-ol', esc(title))
}

// --- Panel definitions -------------------------------------------------------------
// { title, icon, colors: [top, bottom], render(body, ctx), sig?(), tick?(body), chips?() }
function makeDefs(ctx) {
  let invTab = 'bikes'
  let petSel = 0 // Pets panel: the selected pet's uid
  let petDel = 0 // uid waiting for the second "Delete" tap

  return {
    shop: {
      title: 'Bike Shop',
      icon: 'shop',
      colors: ['#ffb43a', '#ff7a00'],
      sig: () => `${state.bike}|${state.ownedBikes.join()}|${BIKES.filter((b) => state.wins >= b.wins).length}`,
      render(b) {
        b.appendChild(section('Featured'))
        const f = h('div', 'hud-grid hud-grid-cards')
        for (const d of FEATURED_BIKES) f.appendChild(bikeCard(d))
        b.appendChild(f)
        b.appendChild(section('Garage'))
        const g = h('div', 'hud-grid hud-grid-cards')
        for (const d of BIKES) g.appendChild(bikeCard(d))
        b.appendChild(g)
      },
    },

    rebirth: {
      title: 'Rebirth',
      iconHtml: () => rebirthArt(),
      colors: ['#ff5a9a', '#ff1f5a'],
      studs: true,
      chips: () => '',
      sig: () => `${state.level}|${state.rebirths}`,
      render(b) {
        const n = state.rebirths
        const cap = maxLevel(n)
        const pct = Math.min(100, (state.level / cap) * 100)
        const arrow = `<span class="hud-rb2-arrow"><svg viewBox="0 0 48 40"><path d="M4 13h20V4l20 16-20 16v-9H4z" fill="#bfe8ff" stroke="#1f5a9a" stroke-width="3.5" stroke-linejoin="round"/><path d="M8 17h18" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></span>`
        const pill = (cls, bg, text) => `<div class="hud-rb2-pill ${cls}"><span class="hud-rb2-bg">${bg}</span><span class="hud-ol">${text}</span></div>`
        const speed = (m) => pill('is-blue', shoeArt('#7cc4ff'), `${multText(m)} Speed`)
        const lvl = (l) => pill('is-gold', ICONS.star, `Max Lvl. ${l}`)
        b.innerHTML = `
          <div class="hud-rb2">
            <div class="hud-rb2-warn hud-ol">Rebirth resets your level!</div>
            <div class="hud-rb2-grid">
              <div class="hud-rb2-h hud-ol">Rebirth ${n}</div><span></span><div class="hud-rb2-h hud-ol">Rebirth ${n + 1}</div>
              ${speed(rebirthMult(n))}${arrow}${speed(rebirthMult(n + 1))}
              ${lvl(cap)}${arrow}${lvl(maxLevel(n + 1))}
            </div>
            <div class="hud-rb2-bar"><div class="hud-rb2-fill" style="width:${pct}%"></div><span class="hud-ol">Level ${state.level}/${cap}</span></div>
            <div class="hud-rb2-btns"></div>
          </div>`
        const btns = b.querySelector('.hud-rb2-btns')
        btns.append(
          btn(`hud-rb2-go${state.level >= cap ? ' hud-pulse' : ''}`, `<span class="hud-rb2-gobg">${rebirthArt()}</span><span class="hud-ol">Rebirth</span>`, () => rebirth()),
        )
      },
    },

    trails: {
      title: 'Trails',
      icon: 'trails',
      colors: ['#e95cff', '#b01fff'],
      studs: true,
      chips: () => '',
      sig: () => `${state.trail}|${state.ownedTrails.join()}`,
      render(b) {
        const list = h('div', 'hud-tr2-list')
        for (const t of TRAILS) {
          const owned = trailOwned(t)
          const on = state.trail === t.id
          const card = h('div', `hud-tr2 is-${t.look}`)
          card.innerHTML = `<div class="hud-tr2-name hud-ol">${esc(t.name)}</div><div class="hud-tr2-art">${trailArt(t.look)}</div><div class="hud-tr2-mult hud-ol">${shoeIcon()}${multText(t.mult)} Speed</div>`
          const act = h('div', 'hud-tr2-act')
          if (owned) act.appendChild(btn('hud-tr2-btn is-green', `<span class="hud-ol">${on ? 'Equipped' : 'Equip'}</span>`, () => setTrail(t.id)))
          else if (t.prize) act.appendChild(h('div', 'hud-tr2-prize hud-ol', t.prize === 'daily' ? 'Daily Reward' : 'Spin Wheel'))
          else {
            if (t.was) act.appendChild(h('div', 'hud-tr2-was hud-ol', `<span class="hud-tr2-gem">${ICONS.gem}</span>${t.was}`))
            if (t.wins) act.appendChild(btn('hud-tr2-btn is-gold', `<span class="hud-tr2-cur">${ICONS.trophy}</span><span class="hud-ol">${fmt(t.wins)}</span>`, () => buyTrail(t.id, 'wins')))
          }
          card.appendChild(act)
          list.appendChild(card)
        }
        b.appendChild(list)
      },
    },

    pets: {
      title: 'Pets',
      icon: 'pets',
      colors: ['#5fdcff', '#1f9bff'],
      studs: true,
      chips: () =>
        `<button type="button" class="hud-hchip" data-act="slots" aria-label="More pet slots"><span class="hud-hchip-i">${ICONS.pets}</span><span class="hud-ol">${state.equippedPets.length}/${state.petSlots}</span><span class="hud-hchip-plus">${ICONS.plus}</span></button>` +
        `<button type="button" class="hud-hchip" data-act="storage" aria-label="More pet storage"><span class="hud-hchip-i">${backpackArt()}</span><span class="hud-ol">${state.pets.length}/${state.petStorage}</span><span class="hud-hchip-plus">${ICONS.plus}</span></button>`,
      onChip(act) {
        if (act === 'slots') {
          if (state.petSlots >= PET_LIMITS.maxSlots) return ctx.toast('You have every pet slot!', 'info')
          premium({ petSlots: PET_LIMITS.slotStep, message: `+${PET_LIMITS.slotStep} Pet Slot!` })
        } else if (act === 'storage') {
          if (state.petStorage >= PET_LIMITS.maxStorage) return ctx.toast('Your pet storage is maxed!', 'info')
          premium({ petStorage: PET_LIMITS.storageStep, message: `+${PET_LIMITS.storageStep} Pet Storage!` })
        }
      },
      sig: () => `${state.pets.length}|${state.equippedPets.join()}|${petSel}|${petDel}|${state.petSlots}`,
      render(b, again) {
        const pets = sortedPets()
        if (!pets.some((p) => p.uid === petSel)) petSel = pets[0]?.uid ?? 0
        const wrap = h('div', 'hud-pets2')
        const main = h('div', 'hud-pets2-main')
        const grid = h('div', 'hud-pets2-grid')
        for (const p of pets) {
          const def = PETS[p.id]
          grid.appendChild(
            petTile(def, {
              foot: petFoot(def),
              check: state.equippedPets.includes(p.uid),
              sel: p.uid === petSel,
              onTap: () => {
                petSel = p.uid
                petDel = 0
                again()
              },
            }),
          )
        }
        const foot = h('div', 'hud-pets2-foot')
        foot.append(
          btn('hud-pbtn is-green', '<span class="hud-ol">Equip Best</span>', () => equipBest()),
          btn('hud-pbtn is-red', '<span class="hud-ol">Unequip All</span>', () => unequipAll()),
        )
        main.append(grid, foot)
        const side = h('div', 'hud-pets2-side')
        const pet = pets.find((p) => p.uid === petSel)
        if (pet) {
          const def = PETS[pet.id]
          const on = state.equippedPets.includes(pet.uid)
          side.append(
            h('div', 'hud-pets2-title hud-ol', esc(def.name)),
            petTile(def, { foot: petFoot(def), big: true }),
            h('div', 'hud-pets2-rar hud-ol', `${esc(def.rarity)} • ${multText(petMult())} total`),
            btn('hud-pbtn is-green', `<span class="hud-ol">${on ? 'Unequip' : 'Equip'}</span>`, () => togglePet(pet.uid)),
            btn('hud-pbtn is-red', `<span class="hud-ol">${petDel === pet.uid ? 'Sure? Delete' : 'Delete'}</span>`, () => {
              if (petDel !== pet.uid) {
                petDel = pet.uid
                again()
                return
              }
              petDel = 0
              deletePet(pet.uid)
            }),
          )
        }
        wrap.append(main, side)
        b.appendChild(wrap)
      },
    },

    worlds: {
      title: 'Worlds',
      icon: 'worlds',
      colors: ['#a6ff3a', '#3fd41a'],
      studs: true,
      chips: () => '',
      sig: () => `${state.level}|${state.world}|${state.worlds.join()}`,
      render(b) {
        const list = h('div', 'hud-wd2-list')
        WORLDS.forEach((w) => {
          const here = state.world === w.id
          const open = state.worlds.includes(w.id)
          const card = h('div', `hud-wd2${here ? ' is-here' : ''}`)
          const sub = here ? "You're here!" : open ? 'Unlocked!' : `Lvl. ${w.level} Required`
          const boost = w.bonus > 1 ? `<div class="hud-wd2-boost hud-ol">x${w.bonus} Speed in this world</div>` : ''
          const pct = Math.min(100, Math.round((state.level / Math.max(1, w.level)) * 100))
          const bar = !open ? `<div class="hud-wd2-bar"><span style="width:${pct}%"></span></div>` : ''
          card.innerHTML = `<div class="hud-wd2-art">${worldArt(w.art)}</div><div class="hud-wd2-shade"></div><div class="hud-wd2-name hud-ol">${esc(w.name)}</div><div class="hud-wd2-sub hud-ol">${sub}</div>${boost}${bar}`
          if (!here) {
            card.appendChild(
              btn(`hud-wd2-btn${open ? ' is-go' : ''}`, `<span class="hud-ol">${open ? 'TELEPORT' : 'LOCKED'}</span>`, () => {
                if (!open) return ctx.toast(`Reach Level ${w.level} to unlock ${w.name} (you are ${state.level})`, 'info')
                if (travelTo(w.id)) ctx.close?.()
              }),
            )
          }
          list.appendChild(card)
        })
        b.appendChild(list)
      },
    },

    inventory: {
      title: 'Inventory',
      icon: 'inventory',
      colors: ['#ff8a5c', '#e8442a'],
      sig: () => `${invTab}|${state.bike}|${state.ownedBikes.join()}|${BIKES.filter((x) => state.wins >= x.wins).length}|${state.pets.length}|${state.equippedPets.join()}`,
      render(b, again) {
        const tabs = h('div', 'hud-tabs')
        for (const [id, label] of [['bikes', 'Bikes'], ['pets', 'Pets']]) {
          tabs.appendChild(
            btn(`hud-tab${invTab === id ? ' is-on' : ''}`, label, () => {
              if (invTab === id) return
              invTab = id
              again()
            }),
          )
        }
        b.appendChild(tabs)
        if (invTab === 'bikes') {
          const g = h('div', 'hud-grid hud-grid-cards')
          for (const d of ALL_SHOP) if (bikeUnlocked(d)) g.appendChild(bikeCard(d, { inventory: true }))
          b.appendChild(g)
        } else b.appendChild(petsGrid())
      },
    },

    pranks: {
      title: 'Pranks',
      icon: 'pranks',
      colors: ['#c56bff', '#8a2be2'],
      render(b) {
        b.appendChild(h('div', 'hud-empty', `${i('pranks', 'hud-empty-i hud-wobble')}<b class="hud-ol">Coming soon!</b><span>Prank your friends with banana peels, fake boulders and more.</span>`))
      },
    },

    daily: {
      title: 'Daily Rewards',
      icon: null,
      iconHtml: () => calendarIcon(new Date().getDate()),
      colors: ['#5fd8ff', '#1f8fff'],
      studs: true,
      chips: () => '',
      sig: () => `${dailyIndex()}|${dailyReadyIn() === 0}`,
      render(b) {
        const idx = dailyIndex()
        const ready = dailyReadyIn() === 0
        const grid = h('div', 'hud-dd-grid')
        DAILY_REWARDS.forEach((r, d) => {
          const claimed = d < idx
          const current = d === idx
          let art = ''
          let label = ''
          if (r.speed) [art, label] = [shoeArt(r.shoe), `+${commas(r.speed)} Speed`]
          else if (r.wins) [art, label] = [winsArt(), `+${commas(r.wins)} Wins`]
          else if (r.trail) {
            const t = TRAILS.find((x) => x.id === r.trail)
            ;[art, label] = [trailArt(t?.look), t?.name ?? 'Trail']
          } else if (r.bike) {
            const def = ALL_BIKES.find((x) => x.id === r.bike)
            ;[art, label] = [bikeArt(def), def?.name ?? 'Bike']
          }
          const cls = `hud-dd is-${claimed ? 'claimed' : r.look}${current && ready ? ' is-ready' : ''}${d === DAILY_REWARDS.length - 1 ? ' is-big' : ''}`
          const html = `<span class="hud-dd-n hud-ol">Day ${d + 1}</span><span class="hud-dd-t hud-ol" data-day="${d}"></span><span class="hud-dd-i">${art}</span><span class="hud-dd-r hud-ol">${esc(label)}</span>${claimed ? `<span class="hud-dd-check">${checkArt()}</span>` : ''}`
          const tile = current && ready ? btn(cls, html, () => claimDaily()) : h('div', cls, html)
          grid.appendChild(tile)
        })
        b.appendChild(grid)
        this.tick(b)
      },
      tick(b) {
        const idx = dailyIndex()
        const left = dailyReadyIn()
        for (const el of b.querySelectorAll('.hud-dd-t')) {
          const d = Number(el.dataset.day)
          if (d < idx) setText(el, '')
          else if (d === idx) setText(el, left === 0 ? 'Claim!' : `(${dhms(left)})`)
          else setText(el, `(${dhms(left + (d - idx) * 86400)})`)
        }
      },
    },

    customSpeed: {
      title: 'Custom Speed',
      icon: 'pencil',
      colors: ['#5fc8ff', '#1f6bff'],
      render(b) {
        const max = ECONOMY.customSpeedMax
        const label = (v) => (v >= max ? 'MAX' : String(v))
        const box = h('div', 'hud-cs-panel')
        const val = h('div', 'hud-cs-val hud-ol', label(state.customSpeed))
        const range = h('input', 'hud-range')
        Object.assign(range, { type: 'range', min: '10', max: String(max), step: '1', value: String(state.customSpeed) })
        range.setAttribute('aria-label', 'Custom speed')
        const apply = (v) => {
          setCustomSpeed(v)
          setText(val, label(state.customSpeed))
          range.value = String(state.customSpeed)
          range.style.setProperty('--p', `${((state.customSpeed - 10) / (max - 10)) * 100}%`)
        }
        range.addEventListener('input', () => apply(Number(range.value)))
        range.style.setProperty('--p', `${((state.customSpeed - 10) / (max - 10)) * 100}%`)
        const presets = h('div', 'hud-row-btns')
        for (const v of [Math.round(max / 4), Math.round(max / 2), max]) {
          presets.appendChild(btn('hud-btn hud-c-blue', v >= max ? 'MAX' : String(v), () => apply(v)))
        }
        box.append(val, range, h('div', 'hud-range-scale', `<span>10</span><span>MAX: ${max}</span>`), presets, h('div', 'hud-note', 'Caps how fast your bike goes, so tricky parts are easier to ride.'))
        b.appendChild(box)
      },
    },

    gems: {
      title: 'Gem Shop',
      icon: 'gem',
      colors: ['#5fe6ff', '#0aa6d8'],
      render(b) {
        const list = h('div', 'hud-list')
        GEM_PACKS.forEach((p, k) => {
          const row = h('div', 'hud-row-item hud-gempack')
          row.appendChild(h('span', `hud-gem-stack s${Math.min(k + 1, 5)}`, ICONS.gem.repeat(Math.min(k + 1, 3))))
          row.appendChild(h('div', 'hud-row-text', `<b>+${fmt(p.gems)} Gems</b>${p.tag ? `<span class="hud-pack-tag">${p.tag}</span>` : '<span>Gem pack</span>'}`))
          row.appendChild(btn('hud-btn hud-c-green', 'Get', () => premium({ gems: p.gems, message: `+${fmt(p.gems)} Gems` })))
          list.appendChild(row)
        })
        b.appendChild(list)
      },
    },
  }
}

// --- Modal shell -----------------------------------------------------------------------
export function createPanels(root, ctx) {
  const defs = makeDefs(ctx)
  const modal = h('div', 'hud-modal')
  modal.hidden = true
  const card = h('div', 'hud-card')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  const head = h('div', 'hud-card-head')
  const icon = h('span', 'hud-card-icon')
  const title = h('div', 'hud-card-title hud-ol')
  const chips = h('div', 'hud-chips')
  const close = btn('hud-close', ICONS.close, () => api.close())
  close.setAttribute('aria-label', 'Close')
  head.append(icon, title, chips, close)
  chips.addEventListener('click', (e) => {
    const a = e.target.closest?.('[data-act]')
    if (a && current?.onChip) {
      e.stopPropagation()
      current.onChip(a.dataset.act)
      renderChips()
    }
  })
  const body = h('div', 'hud-card-body')
  card.append(head, body)
  modal.appendChild(card)
  root.appendChild(modal)

  // Backdrop tap closes (only when the press also started on the backdrop).
  let downOnBackdrop = false
  modal.addEventListener('pointerdown', (e) => {
    downOnBackdrop = e.target === modal
  })
  modal.addEventListener('click', (e) => {
    if (e.target === modal && downOnBackdrop) api.close()
    downOnBackdrop = false
  })

  let current = null
  let currentName = ''
  let lastSig = ''
  let acc = 0

  function render() {
    const scroll = body.scrollTop
    body.textContent = ''
    current.render(body, render)
    body.scrollTop = scroll
    lastSig = current.sig ? current.sig() : ''
  }
  function renderChips() {
    const html = current.chips
      ? current.chips()
      : `<span class="hud-chip">${i('trophy')}${fmt(state.wins)}</span>`
    if (chips._t !== html) {
      chips._t = html
      chips.innerHTML = html
    }
  }

  const api = {
    open(name) {
      const def = defs[name]
      if (!def) return
      if (document.pointerLockElement) document.exitPointerLock?.()
      current = def
      currentName = name
      card.style.setProperty('--h1', def.colors[0])
      card.style.setProperty('--h2', def.colors[1])
      card.dataset.panel = name
      card.classList.toggle('hud-card-studs', !!def.studs)
      icon.innerHTML = def.iconHtml ? def.iconHtml() : ICONS[def.icon] || ''
      title.textContent = def.title
      body.scrollTop = 0
      modal.hidden = false
      card.classList.remove('is-pop')
      void card.offsetWidth // restart the pop-in animation
      card.classList.add('is-pop')
      renderChips()
      render()
      body.scrollTop = 0
      ctx.onChange?.(true)
    },
    close() {
      if (!current) return
      current = null
      currentName = ''
      modal.hidden = true
      body.textContent = ''
      ctx.onChange?.(false)
    },
    toggle(name) {
      if (currentName === name) api.close()
      else api.open(name)
    },
    isOpen: () => !!current,
    name: () => currentName,
    // Called every frame by the HUD; does real work ~4x per second.
    update(dt) {
      if (!current) return
      acc += dt
      if (acc < 0.25) return
      acc = 0
      renderChips()
      if (current.sig && current.sig() !== lastSig) render()
      else current.tick?.(body)
    },
  }
  return api
}
