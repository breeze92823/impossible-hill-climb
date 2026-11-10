// The game-server link (Colyseus, ../Bowling-roll-backend; contract in its CLAUDE.md).
// - Saves: signed-in players' progress lives in the server's Mongo doc. `progress` (the saved doc)
//   replaces the local state, `noProgress` (new account / no database) pushes the local one as the
//   first save, `serverError` turns saving off so an unread save is never overwritten.
//   Nothing is saved in the browser: guests and solo play (no server) last the page only.
// - Leaderboards: `leaderboard` { boards: { wins|speed|played|rebirths: [{ name, value }] }, ranks }.
// - Presence: `pose` ~5/s and `loadout` (bike, trail, pets), relayed through the roster.
// Nothing here may throw: if the server is unreachable the game plays solo and retries.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, LEADERBOARDS, NET, SERVER_URL } from './config.js'
import { authState, canResolveServer, getEquippedAvatar, getPfp, getProportions, getSkinTextureUrl, getToken, launchRoomId, locateRoom, onAvatarChanged, onProportionsChanged, playerInRoom, playerJoined, resolveServerEndpoint, submitScores, subscribeAuth, updateRoom } from './bloxity.js'
import { hydrate, on, snapshot, state } from './game/state.js'

// players: the room's roster (backend PlayerState by sessionId), sessionId: ours.
export const net = {
  room: null,
  connected: false,
  hydrated: false,
  leaderboard: null,
  sessionId: '',
  // The roster arrives with the first state sync, after the join resolves: read it lazily.
  get players() {
    return this.room?.state?.players ?? null
  },
}

const listeners = {}
export function onNet(event, fn) {
  ;(listeners[event] ||= new Set()).add(fn)
  return () => listeners[event].delete(fn)
}
const emit = (event, data) => listeners[event]?.forEach((fn) => fn(data))

// --- Identity -------------------------------------------------------------------
function storedId(storage, key, make) {
  try {
    let id = storage.getItem(key)
    if (!id) storage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId(globalThis.localStorage, 'ihc-guest', () => `guest-${rand()}`)
// Dev builds without the SDK: every tab is its own signed-in dev account, so saves can be tested.
const DEV = DEV_MODE || (import.meta.env.DEV && !window.Legion) ? storedId(globalThis.sessionStorage, 'ihc-dev', () => `dev-${rand()}`) : ''

function identity() {
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (id) return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
}
// What the server verifies (never a client-sent id): the Bloxity game token; dev builds without the
// SDK send their dev id, which a local server accepts (backend auth.ts).
function authFields() {
  const id = identity()
  return { username: id.username, token: getToken(), userId: DEV && id.userId === DEV ? DEV : '' }
}
export const hasServer = () => !!(SERVER_URL || canResolveServer())
export const isGuest = () => sentId.startsWith('guest-') // guests have no server save

// --- Saving -----------------------------------------------------------------------
let lastSaved = ''
let saveTimer = 0
let firstDirty = 0
let sentId = '' // identity the server currently attributes saves to
let loadedId = '' // identity whose saved progress this tab has already loaded

export function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

export function saveNow() {
  clearTimeout(saveTimer)
  saveTimer = 0
  firstDirty = 0
  if (!net.connected || !net.hydrated || isGuest()) return
  const snap = snapshot()
  const json = JSON.stringify(snap)
  if (json === lastSaved) return
  lastSaved = json
  send('saveProgress', snap)
}

function scheduleSave() {
  if (!net.connected || !net.hydrated || isGuest()) return
  const now = performance.now()
  if (!firstDirty) firstDirty = now
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, Math.min(NET.saveDebounce * 1000, Math.max(0, firstDirty + NET.saveMaxWait * 1000 - now)))
}

// --- Presence ---------------------------------------------------------------------
let poseAt = 0
let lastPose = ''
const cm = (n) => Math.round(n * 100) / 100
// Called from the game loop with the rider's feet position, heading and speed.
export function sendPose({ x, y, z, yaw, speed }) {
  if (!net.connected) return
  const now = performance.now()
  if (now - poseAt < NET.poseEvery * 1000) return
  const msg = { x: cm(x), y: cm(y), z: cm(z), yaw: cm(yaw), speed: cm(speed) }
  const key = Object.values(msg).join()
  if (key === lastPose) return
  poseAt = now
  lastPose = key
  send('pose', msg)
}

const loadout = () => ({
  bike: state.bike,
  trail: state.trail,
  pets: state.equippedPets.map((uid) => state.pets.find((p) => p.uid === uid)?.id).filter(Boolean),
})
let sentLoadout = ''
function syncLoadout() {
  const l = loadout()
  const json = JSON.stringify(l)
  if (!net.connected || json === sentLoadout) return
  sentLoadout = json
  send('loadout', l)
}

// The signed-in player's Bloxity look for the others' copy of them (backend AVATAR_MAX_LEN).
const AVATAR_MAX = 3000
function avatarJson() {
  const equipped = authState.user ? getEquippedAvatar() : null
  if (!equipped) return ''
  const look = { equipped, proportions: getProportions() ?? null, skin: getSkinTextureUrl() }
  let json = JSON.stringify(look)
  if (json.length > AVATAR_MAX) json = JSON.stringify({ ...look, skin: null })
  return json.length > AVATAR_MAX ? '' : json
}
let sentAvatar = ''
function syncAvatar() {
  if (!net.connected || avatarJson() === sentAvatar) return
  send('setAvatar', { avatar: (sentAvatar = avatarJson()) })
}

// --- Connection -------------------------------------------------------------------
function attach(room, relayRoomId = '') {
  net.room = room
  net.sessionId = room.sessionId
  net.connected = true
  // Friends' Join / invite links land in this room (Boxity: "<relayRoomId>~<colyseusRoomId>").
  updateRoom(relayRoomId ? `${relayRoomId}~${room.roomId}` : room.roomId)
  const known = new Set()
  let first = true
  lastPose = ''
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    // A reconnect under the same identity: this tab may hold changes the debounce hadn't sent yet,
    // so push it rather than load over it.
    if (loadedId === sentId || !doc) return saveNow()
    loadedId = sentId
    hydrate(doc)
    lastSaved = JSON.stringify(snapshot()) // what the server holds: don't echo it straight back
  })
  room.onMessage('noProgress', () => {
    // New account, guest or no database: keep the local progress and push it as the first save.
    net.hydrated = true
    loadedId = sentId
    lastSaved = ''
    saveNow()
  })
  room.onMessage('serverError', () => {
    // The save exists but could not be read: never overwrite it.
    net.hydrated = false
    console.warn('[net] server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('leaderboard', (msg) => {
    net.leaderboard = msg ?? null
    emit('leaderboard', net.leaderboard)
  })
  room.onStateChange(() => {
    // Boxity toasts friends: "X is here" for those already in the room, "X joined" for newcomers.
    const seen = new Set()
    room.state?.players?.forEach?.((p, id) => {
      seen.add(id)
      if (id === room.sessionId || known.has(id) || !p.username) return
      known.add(id)
      if (first) playerInRoom(p.username)
      else playerJoined(p.username)
    })
    for (const id of known) if (!seen.has(id)) known.delete(id)
    first = false
    emit('roster', room.state)
  })
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    updateRoom('')
    net.hydrated = false
    emit('connection', false)
    setTimeout(connect, 3000) // keep trying; solo play is unaffected meanwhile
  })
  emit('connection', true)
}

// Bloxity hosting has no fixed socket URL: the SDK resolves this game's server endpoint on every
// connect. A configured SERVER_URL wins.
async function serverUrl(userId) {
  if (SERVER_URL) return SERVER_URL
  return (await resolveServerEndpoint(userId.startsWith('guest-') ? '' : userId)).endpoint
}

let connecting = false
let sentPfp = ''
let launchTried = false
// The ?roomId= the page opened with (Boxity's Join button / a friend's invite): join that room
// directly; if it is gone or full, fall back to matchmaking.
async function joinLaunchRoom(options) {
  if (launchTried) return null
  launchTried = true
  const id = launchRoomId()
  if (!id) return null
  try {
    const where = await locateRoom(id)
    if (!where) return null
    const room = await new Client(where.endpoint).joinById(where.roomId, options)
    return { room, relay: where.relayRoomId || '' }
  } catch (err) {
    console.info('[net] launch room unavailable, matchmaking instead', err?.message ?? err)
    return null
  }
}

async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    sentPfp = getPfp()
    sentAvatar = avatarJson()
    sentLoadout = JSON.stringify(loadout())
    const options = { ...authFields(), pfp: sentPfp, avatar: sentAvatar, loadout: loadout() }
    const launched = await joinLaunchRoom(options)
    if (launched) return attach(launched.room, launched.relay)
    // Resolve on EVERY connect and build a new Client: an endpoint is pinned to one pod.
    let url = SERVER_URL
    let relay = ''
    if (!url) {
      const r = await resolveServerEndpoint(id.userId.startsWith('guest-') ? '' : id.userId)
      url = r.endpoint
      relay = r.relayRoomId || ''
    }
    attach(await new Client(url).joinOrCreate('world', options), relay)
  } catch (err) {
    console.info('[net] could not reach the server; playing solo', err?.message ?? err, err?.stack)
    setTimeout(connect, NET.retry * 1000)
  } finally {
    connecting = false
  }
}

// A signed-in player with no server connection still ranks: the Bloxity SDK takes the scores
// directly (the server reports them itself once connected, from the saved state).
let boardTimer = 0
function soloBoards() {
  if (net.connected || boardTimer || !authState.user) return
  boardTimer = setTimeout(() => {
    boardTimer = 0
    if (!net.connected) submitScores(Object.fromEntries(LEADERBOARDS.map((b) => [b.id, state[b.stat]])))
  }, 30000)
}

export function initNet() {
  if (!hasServer()) return console.info('[net] no server configured; playing solo')
  on('change', scheduleSave)
  on('change', soloBoards)
  on('bike', syncLoadout)
  on('trail', syncLoadout)
  on('pets', syncLoadout)
  // The first ready call connects; later ones are sign-in / sign-out.
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    if (getPfp() !== sentPfp) send('identify', { ...authFields(), pfp: (sentPfp = getPfp()) })
    syncAvatar()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username })
    saveNow() // under the old id, before switching
    net.hydrated = false
    sentId = id.userId
    send('identify', { ...authFields(), pfp: sentPfp })
  })
  onAvatarChanged(syncAvatar)
  onProportionsChanged(syncAvatar)
  window.addEventListener('beforeunload', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
}
