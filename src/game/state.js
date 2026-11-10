// The player's progress and every rule that changes it. Nothing is stored in the browser: the game
// server's save (net.js -> hydrate/snapshot) is the only one, so guests and solo play last the page.
// UI and world code read `state` and call the actions below; nothing else
// writes it. Listeners: on('change'|'levelup'|'toast'|'hatch'|'bike'|'pets'|'trail'|'spins', fn).
import { ALL_BIKES, BIKES, DAILY_REWARDS, DEV_MODE, ECONOMY, EGGS, LANE, PET_LIMITS, PETS, SPIN, STARTER_PET, TRAILS, TREADMILLS, WORLD_CHESTS, WORLDS } from '../config.js'

const now = () => Date.now() / 1000

const fresh = () => ({
  speed: 0, // the training stat shown as "Speed"
  level: 1,
  xp: 0,
  wins: 0,
  gems: 0,
  rebirths: 0,
  bike: 'zippy', // equipped bike id
  ownedBikes: ['zippy'], // featured (premium) bikes only enter this list when bought
  pets: [], // no starter pet: the multiplier starts at exactly x1
  equippedPets: [],
  nextPetUid: 1,
  trail: 'none', // equipped trail id ('none' = no trail)
  boosts: { speed: 0, wins: 0 }, // unix seconds the timed boost runs until (Infinity-like 1e12 = permanent)
  customSpeed: ECONOMY.customSpeedMax,
  lastChest: 0,
  lastAd: 0, // unix s of the last rewarded-ad bonus
  daily: { streak: 0, last: 0 }, // days claimed in a row, unix s of last claim
  spins: SPIN.startSpins, // banked wheel spins
  spinTimer: SPIN.freeEvery, // s of play left until the next free spin
  ownedTrails: [], // trails bought or won
  petSlots: PET_LIMITS.slots, // pets equipped at once
  petStorage: PET_LIMITS.storage, // pets owned at most
  played: 0, // seconds played
  boulderStop: 0, // unix s the boulders are held back until (Stop Boulders)
  introSeen: false, // watched or skipped the new-player intro (game/intro.js)
  world: 'w1', // the world you are in (WORLDS id); you come back there next time
  worlds: ['w1'], // worlds unlocked for good (reached their level once)
  worldChests: {}, // { w2: unix s } last claim of each world hub's chest
})

export const state = fresh()
normalize()

// Old saves: drop pets/trails that are no longer in the catalogs, unequip what is not owned.
function normalize() {
  const f = fresh()
  state.pets = (Array.isArray(state.pets) ? state.pets : []).filter((p) => p && PETS[p.id])
  state.nextPetUid = Math.max(state.nextPetUid || 1, ...state.pets.map((p) => p.uid + 1))
  state.petSlots = Math.max(PET_LIMITS.slots, Math.min(PET_LIMITS.maxSlots, state.petSlots || 0))
  state.petStorage = Math.max(PET_LIMITS.storage, Math.min(PET_LIMITS.maxStorage, state.petStorage || 0))
  const uids = new Set(state.pets.map((p) => p.uid))
  state.equippedPets = (state.equippedPets || []).filter((u) => uids.has(u)).slice(0, state.petSlots)
  state.ownedTrails = (state.ownedTrails || []).filter((id) => TRAILS.some((t) => t.id === id))
  if (state.trail !== 'none' && !state.ownedTrails.includes(state.trail)) state.trail = 'none'
  state.worlds = ['w1', ...(Array.isArray(state.worlds) ? state.worlds : []).filter((id) => id !== 'w1' && WORLDS.some((w) => w.id === id))]
  state.worlds = [...new Set(state.worlds)]
  for (const w of WORLDS) if (state.level >= w.level && !state.worlds.includes(w.id)) state.worlds.push(w.id) // accounts from before the worlds
  if (!state.worlds.includes(state.world)) state.world = 'w1'
  state.worldChests = state.worldChests && typeof state.worldChests === 'object' ? state.worldChests : {}
}

// --- Events -----------------------------------------------------------------------
const listeners = {}
export function on(event, fn) {
  ;(listeners[event] ||= new Set()).add(fn)
  return () => listeners[event].delete(fn)
}
function emit(event, data) {
  listeners[event]?.forEach((fn) => fn(data))
}
export const toast = (text, kind = 'info') => emit('toast', { text, kind })

function changed() {
  emit('change', state)
}

// --- Server save (net.js) -----------------------------------------------------------
// The keys the backend stores (backend sanitize.ts sanitizeProgress). Same names as `state`.
const SAVED_KEYS = ["speed", "level", "xp", "wins", "gems", "rebirths", "bike", "ownedBikes", "pets", "equippedPets", "nextPetUid", "trail", "boosts", "customSpeed", "lastChest", "lastAd", "daily", "spins", "spinTimer", "ownedTrails", "petSlots", "petStorage", "played", "boulderStop", "introSeen", "world", "worlds", "worldChests"]
export const snapshot = () => JSON.parse(JSON.stringify(Object.fromEntries(SAVED_KEYS.map((k) => [k, state[k]]))))
// A save loaded from the server replaces the local progress (missing keys keep a fresh default).
export function hydrate(doc) {
  const f = fresh()
  const next = {}
  for (const k of SAVED_KEYS) next[k] = doc[k] !== undefined ? doc[k] : f[k]
  next.boosts = { ...f.boosts, ...(doc.boosts ?? {}) }
  next.daily = { ...f.daily, ...(doc.daily ?? {}) }
  next.worldChests = { ...(doc.worldChests ?? {}) }
  if (!next.ownedBikes.includes(next.bike)) next.ownedBikes.push(next.bike)
  Object.assign(state, next)
  normalize()
  changed()
  emit("bike", state.bike)
  emit("trail", state.trail)
  emit("pets", state.equippedPets)
  emit("world", state.world)
}

// The new-player intro has been watched or skipped: saved, so it never plays again for this account.
export function markIntroSeen() {
  if (state.introSeen) return
  state.introSeen = true
  changed()
}

// --- Derived values -----------------------------------------------------------------
export const bikeDef = (id = state.bike) => ALL_BIKES.find((b) => b.id === id) ?? BIKES[0]
export const petDef = (id) => PETS[id]
export const xpNeeded = (level = state.level) => Math.round(ECONOMY.xpBase * Math.pow(ECONOMY.xpGrowth, level - 1))
export const rebirthLevel = () => maxLevel()
export const boostActive = (kind) => state.boosts[kind] > now()
export const boostLeft = (kind) => Math.max(0, state.boosts[kind] - now())
const trailDef = (id = state.trail) => TRAILS.find((t) => t.id === id)
// Speed multipliers: rebirths ("x2 Speed" at Rebirth 2) x equipped trail x equipped pets.
export const rebirthMult = (n = state.rebirths) => 1 + n * ECONOMY.rebirthBonus
export const trailMult = () => trailDef()?.mult ?? 1
export function petMult() {
  let m = 1
  for (const uid of state.equippedPets) {
    const p = state.pets.find((x) => x.uid === uid)
    if (p) m *= PETS[p.id]?.mult ?? 1
  }
  return m
}
// The world you are in boosts every Speed gain there (WORLDS[].bonus: Jungle x2, Volcano x4).
export const worldDef = (id = state.world) => WORLDS.find((w) => w.id === id) ?? WORLDS[0]
export const worldBonus = () => worldDef().bonus ?? 1
// The "x2.16 Multiplier" shown in the HUD.
export const multiplier = () => rebirthMult() * trailMult() * petMult() * worldBonus()
// Levels stop at the rebirth level until you rebirth ("Max Lvl. 75").
export const maxLevel = (n = state.rebirths) => ECONOMY.rebirthBaseLevel + n * ECONOMY.rebirthLevelStep
export const speedBoost = () => (boostActive('speed') ? ECONOMY.boostFactor : 1)
export const winsBoost = () => (boostActive('wins') ? ECONOMY.boostFactor : 1)
export const bikeUnlocked = (def) => (def.featured || def.prize ? state.ownedBikes.includes(def.id) : state.wins >= def.wins || state.ownedBikes.includes(def.id))
export const trailOwned = (t) => state.ownedTrails.includes(t.id)
export function treadmillUnlocked(t) {
  if (!t.req) return true
  if (t.req.level && state.level < t.req.level) return false
  if (t.req.rebirths && state.rebirths < t.req.rebirths) return false
  return true
}
export const adReadyIn = () => Math.max(0, state.lastAd + ECONOMY.adCooldown - now())
export const chestReadyIn = () => Math.max(0, state.lastChest + ECONOMY.chestCooldown - now())
// Seconds of play until the next free spin.
export const spinReadyIn = () => Math.max(0, state.spinTimer)
const DAY = 86400
export const dailyReadyIn = () => Math.max(0, state.daily.last + DAY - now())
export const dailyIndex = () => (dailyReadyIn() === 0 && now() - state.daily.last > 2 * DAY ? 0 : state.daily.streak % DAILY_REWARDS.length)

// Hill-lane top speed from the Speed stat ("MAX: 184" in the HUD), and the
// one actually used after the Custom Speed cap.
export function rideMax(speed = state.speed) {
  const r = LANE.rideMax
  return Math.round(r.base + r.k * Math.log10(1 + Math.max(0, speed) / r.div))
}
export const rideCap = () => (state.customSpeed >= ECONOMY.customSpeedMax ? rideMax() : Math.min(rideMax(), state.customSpeed))
export const bouldersStopped = () => state.boulderStop > now()

// Wins from the hill (cave pads, summit); returns what was actually added.
export function addWins(n) {
  const w = Math.round(n * winsBoost())
  state.wins += w
  changed()
  emit('wins', w)
  return w
}

// --- Number formatting: 306860 -> "306.86k" ----------------------------------------
const UNITS = ['', 'k', 'M', 'B', 'T', 'Qd', 'Qn']
export function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) < 1000) return String(Math.floor(n))
  let u = 0
  while (Math.abs(n) >= 1000 && u < UNITS.length - 1) {
    n /= 1000
    u++
  }
  return `${parseFloat(n.toFixed(digits))}${UNITS[u]}`
}

// --- Worlds -------------------------------------------------------------------------------
export const worldUnlocked = (id) => state.worlds.includes(id)
// Reaching a world's level unlocks it for good.
function unlockWorlds() {
  for (const w of WORLDS) {
    if (state.level < w.level || state.worlds.includes(w.id)) continue
    state.worlds.push(w.id)
    emit('worldUnlocked', w)
    toast(`${w.emoji ?? ''} ${w.name} unlocked! Open Worlds to travel`, 'reward')
  }
}
// Travel to an unlocked world: main.js moves the player (on 'world').
export function travelTo(id) {
  const w = WORLDS.find((x) => x.id === id)
  if (!w) return false
  if (!worldUnlocked(id)) {
    toast(`Reach Level ${w.level} to unlock ${w.name} (you are ${state.level})`, 'error')
    return false
  }
  state.world = id
  changed()
  emit('world', id)
  return true
}
// World hub chests (WORLD_CHESTS): own cooldown per world.
export const worldChestReadyIn = (id) => Math.max(0, (state.worldChests[id] || 0) + (WORLD_CHESTS[id]?.cooldown ?? 900) - now())
export function claimWorldChest(id) {
  const c = WORLD_CHESTS[id]
  if (!c || worldChestReadyIn(id) > 0) return false
  state.worldChests = { ...state.worldChests, [id]: now() }
  const [lo, hi] = c.wins
  grant({ wins: Math.round(lo + Math.random() * (hi - lo)) }, `${worldDef(id).short} Chest`)
  return true
}

// --- Training ------------------------------------------------------------------------
// Adds raw speed (already including every multiplier) and its xp; levels up as needed.
export function addSpeed(amount) {
  if (!(amount > 0)) return
  state.speed += amount
  state.xp += amount
  let need = xpNeeded()
  const cap = maxLevel()
  while (state.xp >= need && state.level < cap) {
    state.xp -= need
    state.level++
    const wins = ECONOMY.winsPerLevel * state.level * winsBoost()
    state.wins += wins
    emit('levelup', { level: state.level, wins })
    need = xpNeeded()
    unlockWorlds()
  }
  if (state.level >= cap) state.xp = Math.min(state.xp, need) // full bar at the max level
  changed()
}
// Per-second gain riding (moving; x hill = the lane's height bonus, LANE.train) or on a
// treadmill (afkMult); dt in seconds.
export function train(dt, { riding = false, afkMult = 0, hill = 1 } = {}) {
  const base = bikeDef().perSpeed * multiplier() * speedBoost()
  let gain = 0
  if (afkMult > 0) gain += ECONOMY.afkGainPerSec * afkMult * base * dt
  else if (riding) gain += ECONOMY.rideGainPerSec * hill * base * dt
  state.played += dt
  if (gain > 0) addSpeed(gain)
}

// --- Rewards -----------------------------------------------------------------------
function grant(reward, source) {
  const parts = []
  if (reward.wins) {
    const w = Math.round(reward.wins * winsBoost())
    state.wins += w
    parts.push(`${fmt(w)} Wins`)
  }
  if (reward.gems) {
    state.gems += reward.gems
    parts.push(`${reward.gems} Gems`)
  }
  if (reward.speed) {
    addSpeed(reward.speed)
    parts.push(`${fmt(reward.speed)} Speed`)
  }
  if (reward.boost) {
    state.boosts[reward.boost] = Math.max(now(), state.boosts[reward.boost]) + reward.seconds
    parts.push(`2x ${reward.boost === 'speed' ? 'Speed' : 'Wins'} for ${Math.round(reward.seconds / 60)}m`)
  }
  changed()
  toast(`${source}: +${parts.join(', +')}`, 'reward')
}

// Called once the Bloxity rewarded ad finished (status 'completed'): a modest bonus, not a jackpot.
export function claimAdReward() {
  if (adReadyIn() > 0) return false
  const [lo, hi] = ECONOMY.adWins
  state.lastAd = now()
  grant({ wins: Math.round(lo + Math.random() * (hi - lo)), speed: ECONOMY.adSpeed }, 'Thanks for watching')
  return true
}
export function claimChest() {
  if (chestReadyIn() > 0) return false
  const [lo, hi] = ECONOMY.chestWins
  state.lastChest = now()
  grant({ wins: Math.round(lo + Math.random() * (hi - lo)) }, 'Free Rewards')
  return true
}
// A reward that may be a bike or trail (owned once won; a duplicate gives r.dupe instead).
function grantPrize(r, source) {
  if (r.bike) {
    const def = ALL_BIKES.find((b) => b.id === r.bike)
    if (state.ownedBikes.includes(r.bike)) return grant(r.dupe || {}, `${source}: you already own ${def?.name ?? 'it'}`)
    state.ownedBikes.push(r.bike)
    changed()
    toast(`${source}: you won the ${def?.name ?? 'bike'}! Equip it in your Inventory`, 'reward')
  } else if (r.trail) {
    const t = trailDef(r.trail)
    if (state.ownedTrails.includes(r.trail)) return grant(r.dupe || {}, `${source}: you already own ${t?.name ?? 'it'}`)
    state.ownedTrails.push(r.trail)
    changed()
    toast(`${source}: you won the ${t?.name ?? 'trail'}! Equip it in Trails`, 'reward')
  } else grant(r, source)
}

export function claimDaily() {
  if (dailyReadyIn() > 0) return false
  const i = dailyIndex()
  state.daily = { streak: i + 1, last: now() }
  grantPrize(DAILY_REWARDS[i], `Day ${i + 1} reward`)
  return true
}
// --- Spin wheel ------------------------------------------------------------------------
// The free-spin clock only runs while the game is visible (play time, not wall time).
let spinClock = performance.now()
setInterval(() => {
  const t = performance.now()
  const dt = Math.min(5, (t - spinClock) / 1000) // a throttled/background tab does not bank time
  spinClock = t
  if (document.hidden) return
  state.spinTimer -= dt
  if (state.spinTimer > 0) return
  state.spinTimer += SPIN.freeEvery
  state.spins++
  changed()
  emit('spins', state.spins)
  toast('+1 Free Spin!', 'good')
}, 1000)

function pickSlice() {
  const total = SPIN.slices.reduce((a, s) => a + s.chance, 0)
  let r = Math.random() * total
  for (let i = 0; i < SPIN.slices.length; i++) {
    r -= SPIN.slices[i].chance
    if (r < 0) return i
  }
  return SPIN.slices.length - 1
}
// Uses one banked spin, picks the slice now (so the wheel can animate to it) and grants
// it right away; the HUD holds the toast until the wheel stops. -1 = no spins left.
export function spin() {
  if (state.spins <= 0) return -1
  const index = pickSlice()
  const s = SPIN.slices[index]
  state.spins--
  emit('spins', state.spins)
  grantPrize(s, 'Spin')
  return index
}

// --- Bikes -----------------------------------------------------------------------------
export function equipBike(id) {
  const def = bikeDef(id)
  if (!def || def.id !== id) return false
  if (!bikeUnlocked(def)) {
    toast(def.featured ? `${def.name} costs ${fmt(def.wins)} Wins at the start pad` : `Need ${fmt(def.wins)} Wins for ${def.name}`, 'error')
    return false
  }
  if (!state.ownedBikes.includes(id)) state.ownedBikes.push(id)
  if (state.bike === id) return true
  state.bike = id
  changed()
  emit('bike', id)
  toast(`Equipped ${def.name}!`, 'good')
  return true
}
// Featured bikes cost wins.
export function buyFeaturedBike(id) {
  const def = bikeDef(id)
  if (!def?.featured) return false
  if (state.ownedBikes.includes(id)) return equipBike(id)
  if (state.wins < def.wins) {
    toast(`Need ${fmt(def.wins)} Wins for ${def.name}`, 'error')
    return false
  }
  state.wins -= def.wins
  state.ownedBikes.push(id)
  changed()
  return equipBike(id)
}

// --- Pets ---------------------------------------------------------------------------------
function rollPet(egg) {
  const total = egg.pets.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [id, w] of egg.pets) {
    r -= w
    if (r <= 0) return id
  }
  return egg.pets[0][0]
}
// Hatches up to `count` eggs (stops when wins or storage run out). Returns the new pets.
export function hatch(eggId, count = 1) {
  const egg = EGGS.find((e) => e.id === eggId)
  if (!egg) return []
  const out = []
  for (let k = 0; k < count; k++) {
    if (state.pets.length >= state.petStorage) {
      toast(`Pet storage full (${state.petStorage})! Delete pets or get more storage`, 'error')
      break
    }
    if (state.wins < egg.cost) {
      if (!out.length) toast(`Need ${fmt(egg.cost)} Wins to hatch`, 'error')
      break
    }
    state.wins -= egg.cost
    const id = rollPet(egg)
    const pet = { uid: state.nextPetUid++, id }
    state.pets.push(pet)
    if (state.equippedPets.length < state.petSlots) state.equippedPets.push(pet.uid)
    out.push(pet)
  }
  if (!out.length) return out
  changed()
  emit('pets', state.equippedPets)
  for (const pet of out) emit('hatch', { egg, pet, def: PETS[pet.id] })
  return out
}
export const canHatch = (eggId) => {
  const egg = EGGS.find((e) => e.id === eggId)
  return !!egg && state.wins >= egg.cost && state.pets.length < state.petStorage
}
function petsChanged() {
  changed()
  emit('pets', state.equippedPets)
}
export function equipPet(uid) {
  if (state.equippedPets.includes(uid) || !state.pets.some((p) => p.uid === uid)) return false
  if (state.equippedPets.length >= state.petSlots) {
    toast(`You can equip ${state.petSlots} pets`, 'error')
    return false
  }
  state.equippedPets.push(uid)
  petsChanged()
  return true
}
export function unequipPet(uid) {
  const i = state.equippedPets.indexOf(uid)
  if (i < 0) return false
  state.equippedPets.splice(i, 1)
  petsChanged()
  return true
}
export const togglePet = (uid) => (state.equippedPets.includes(uid) ? unequipPet(uid) : equipPet(uid))
export function equipBest() {
  const best = [...state.pets].sort((a, b) => (PETS[b.id]?.mult ?? 1) - (PETS[a.id]?.mult ?? 1) || a.uid - b.uid)
  state.equippedPets = best.slice(0, state.petSlots).map((p) => p.uid)
  petsChanged()
}
export function unequipAll() {
  if (!state.equippedPets.length) return
  state.equippedPets = []
  petsChanged()
}
export function deletePet(uid) {
  const i = state.pets.findIndex((p) => p.uid === uid)
  if (i < 0) return false
  if (state.pets.length <= 1) {
    toast('You need to keep at least one pet', 'error')
    return false
  }
  const [pet] = state.pets.splice(i, 1)
  state.equippedPets = state.equippedPets.filter((u) => u !== uid)
  petsChanged()
  toast(`Deleted ${PETS[pet.id]?.name ?? 'pet'}`)
  return true
}

// --- Trails -----------------------------------------------------------------------------
// Equips an owned trail; equipping the one already on takes it off.
export function setTrail(id) {
  if (id === 'none' || id === state.trail) {
    if (state.trail === 'none') return true
    state.trail = 'none'
  } else {
    const t = trailDef(id)
    if (!t) return false
    if (!trailOwned(t)) {
      toast(t.prize === 'daily' ? `${t.name} is a Daily Reward` : t.prize === 'spin' ? `Win ${t.name} on the Spin Wheel` : `Buy ${t.name} first`, 'error')
      return false
    }
    state.trail = id
  }
  changed()
  emit('trail', state.trail)
  return true
}
// Buys a trail with wins ('wins') or gems ('gems', premium) and equips it.
export function buyTrail(id, currency = 'wins') {
  const t = trailDef(id)
  if (!t || trailOwned(t)) return setTrail(id)
  if (currency === 'wins') {
    if (!t.wins) return false
    if (state.wins < t.wins) {
      toast(`Need ${fmt(t.wins)} Wins for ${t.name}`, 'error')
      return false
    }
    state.wins -= t.wins
    state.ownedTrails.push(id)
    changed()
  } else return false
  toast(`Got the ${t.name}!`, 'good')
  return setTrail(id)
}

// Spin packs cost wins.
export function buySpins(pack) {
  if (state.wins < pack.price) {
    toast(`Need ${fmt(pack.price)} Wins`, 'error')
    return false
  }
  state.wins -= pack.price
  state.spins += pack.spins
  changed()
  emit('spins', state.spins)
  return true
}

// --- Rebirth ---------------------------------------------------------------------------
export function canRebirth() {
  return state.level >= rebirthLevel()
}
export function rebirth() {
  if (!canRebirth()) {
    toast(`Reach level ${rebirthLevel()} to rebirth`, 'error')
    return false
  }
  state.rebirths++
  state.level = 1
  state.xp = 0
  if (ECONOMY.rebirthResetsSpeed) state.speed = 0
  changed()
  toast(`Rebirth ${state.rebirths}! x${parseFloat(rebirthMult().toFixed(2))} Speed`, 'reward')
  return true
}
// Skip Rebirth (premium): +1 rebirth, keeps your level and speed.
export const skipRebirth = () => premium({ skipRebirth: true })

// --- Settings + premium stubs ------------------------------------------------------------
export function setCustomSpeed(v) {
  state.customSpeed = Math.max(10, Math.min(ECONOMY.customSpeedMax, Math.round(v)))
  changed()
}
// Premium products (+100K speed, 2x boosts, stop boulders...). There is no store
// backend yet: dev builds grant them for free so they can be tested.
export function premium(product) {
  if (!DEV_MODE && !import.meta.env.DEV) {
    toast('The store is not open yet', 'error')
    return false
  }
  if (product.speed) addSpeed(product.speed)
  if (product.boost) {
    state.boosts[product.boost] = boostActive(product.boost) ? 0 : 1e12 // toggles in dev
    changed()
  }
  if (product.gems) {
    state.gems += product.gems
    changed()
  }
  if (product.spins) {
    state.spins += product.spins
    changed()
    emit('spins', state.spins)
  }
  if (product.trail && !state.ownedTrails.includes(product.trail)) {
    state.ownedTrails.push(product.trail)
    changed()
  }
  if (product.skipRebirth) {
    state.rebirths++
    changed()
    toast(`Rebirth ${state.rebirths}! x${parseFloat(rebirthMult().toFixed(2))} Speed (levels kept)`, 'reward')
  }
  if (product.petSlots) {
    state.petSlots = Math.min(PET_LIMITS.maxSlots, state.petSlots + product.petSlots)
    changed()
  }
  if (product.petStorage) {
    state.petStorage = Math.min(PET_LIMITS.maxStorage, state.petStorage + product.petStorage)
    changed()
  }
  if (product.stopBoulders) {
    state.boulderStop = now() + product.stopBoulders
    changed()
  }
  if (product.message) toast(product.message, 'good')
  return true
}

export function treadmillLabel(t) {
  if (!t.req) return ''
  return t.req.rebirths ? `${t.req.rebirths} Rebirth${t.req.rebirths > 1 ? 's' : ''}` : `Level ${t.req.level}`
}
export { TREADMILLS }
