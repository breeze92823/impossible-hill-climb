import * as THREE from 'three'
import { ACESFilmicToneMapping, Clock, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { BIKES, CAMERA, COARSE_POINTER, ECONOMY, graphicsPreset, JUNGLE, LANE, RENDER, TRAILS, VOLCANO, WORLDS } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, inputState, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { isFirstPerson, onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { label, setNeonBloom } from './propkit.js'
import { buildZones } from './lobby/zones.js'
import { ParticlePool, setParticleQuality, setPointScale, sparkleParticle } from './lobby/fx.js'
import { createRider } from './game/rider.js'
import { createPetPack } from './game/petpack.js'
import { addWins, bikeDef, bouldersStopped, on, rideCap, state, toast, train, travelTo, worldDef } from './game/state.js'
import { angleAt, buildLane, caves, createLaneRiders, heightAt, laneLength, nextGoal, sAt, trainAt } from './lobby/lane.js'
import { createWorlds } from './game/worlds.js'
import { gateEmitters } from './lobby/worldkit.js'
import { createPopups, winSplash } from './game/popups.js'
import { createIntro, introAllowed } from './game/intro.js'
import { audio } from './game/audioBridge.js'
import { installAudioHooks, isMusicOn, musicToggle, onEngine, setAltitude, setBoulders, setEngine, setSuspended, setVolume, setWorldSound, sfx, worldSfx } from './audio/index.js'
import { createHud } from './hud/hud.js'
import { initNet, net, sendPose } from './net.js'
import { createRemotePlayers } from './game/remotePlayers.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> lobby ground + zones + sky,
// player body -> rider (avatar on the equipped bike) + pets -> HUD -> loop. The SDK is optional.
let lighting = null
let renderer = null
let postfx = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    setParticleQuality(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  setPointScale(window.innerHeight * renderer.getPixelRatio(), camera.fov)
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + ground + sky --------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // hub ground, islands, cliffs, trees, clouds
const pools = {
  fire: new ParticlePool(scene, { capacity: 900, texture: 'dot', additive: true }),
  glow: new ParticlePool(scene, { capacity: 600, texture: 'sparkle', additive: true }),
  smoke: new ParticlePool(scene, { capacity: 1500, texture: 'dot', additive: false }),
}
setPointScale(window.innerHeight * renderer.getPixelRatio(), camera.fov)
setParticleQuality(preset.particles)
// World 1 (the lobby + hill lane): its particles only run while you are in it.
let inWorld = 'w1'
const inW1 = () => inWorld === 'w1'
const zones = gateEmitters(pools, inW1, () => buildZones(scene, pools))
const lane = gateEmitters(pools, inW1, () => buildLane(scene, pools, audio))
const laneRiders = createLaneRiders(scene, lane, [], audio)
const popups = createPopups(scene)
const START = { x: 0, y: 0.3, z: -50 } // where the hill sends you back to
// Worlds 2 + 3 (game/worlds.js): their hubs and courses, far off on X; World 1's course adapter.
const worlds = createWorlds({
  scene,
  pools,
  audio,
  lighting,
  w1: {
    roots: [world.root, world.clouds, scene.getObjectByName('zones'), lane.root],
    course: {
      rule: (px, pz, max, wx, wz, sprint) => lane.rule(px, pz, max, wx, wz, sprint),
      trainAt: (px, pz) => trainAt(sAt(pz), rideCap()),
      nextGoal,
      ground: (px, pz) => (sAt(pz) > 0 ? 'lane' : 'road'),
      altitude: (p) => Math.max(0, heightAt(sAt(p.z))),
      start: { ...START, facing: Math.PI },
    },
  },
})
// The course you are on owns movement (the hill: speed from the Speed stat + slope drag; the
// jungle: launches off the ramps; the volcano: bridge speed).
player.moveRule = (wx, wz, sprint) => worlds.course().rule(player.position.x, player.position.z, rideCap(), wx, wz, sprint)
createPlayerBody()
syncYawToPlayer()

// --- Player: avatar seated on the equipped bike, pets behind ---------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const rider = createRider(scene, { pools, trail: true, fx: 'full' })
onEngine((type, k) => rider.fx(type, k)) // backfire flames on the engine's pops and shifts
rider.setBike(bikeDef())
rider.setTrail(TRAILS.find((t) => t.id === state.trail)?.color ?? null)
let avatar = null
let generation = 0
let avatarReady = false

function setAvatar(next) {
  avatar = next
  rider.setAvatar(next)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

const pack = createPetPack(scene)
pack.rebuild(player.position)
// Other players: their Bloxity look on their bike, trail and pets (roster from net.js).
const remotes = createRemotePlayers({ scene, pools, camera })
// Chat: Boxity draws the feed, the game draws the 4 s bubble over the sender.
bloxity.onChatMessage((m) => (m.isLocalPlayer ? bloxity.attachBubble(THREE, rider.group, m) : remotes.bubble(m)))
// Ad breaks (platform midrolls can start any time): pause the simulation and mute in between.
let paused = false
bloxity.onAdBreak((on) => {
  paused = on
  setSuspended(on)
})
// Boxity's own toolbar / chat sit over the top-left: keep the HUD clear of them.
bloxity.onReservedAreas((areas) => {
  let w = 0
  let h = 0
  for (const a of areas) {
    if (a.id === 'chat') continue
    w = Math.max(w, a.left + a.width)
    h = Math.max(h, a.top + a.height)
  }
  const root = document.documentElement.style
  if (w > 0) root.setProperty('--reserved-w', `${w}px`)
  if (h > 0) root.setProperty('--reserved-h', `${h}px`)
})
on('pets', () => pack.rebuild(player.renderPosition))
on('world', (id) => travel(id))
on('bike', () => rider.setBike(bikeDef()))
on('trail', (id) => rider.setTrail(TRAILS.find((t) => t.id === id)?.color ?? null))
on('levelup', () => {
  const p = player.renderPosition
  const colors = ['#ffd21f', '#38e1ff', '#ff3d8b', '#8ef03c']
  for (let i = 0; i < 40; i++) pools.glow.spawn({ ...sparkleParticle(p.x, p.y + 0.5, p.z, colors[i % 4], 1.5), vy: 3 + Math.random() * 4, gravity: -6, life: 1.4 })
})

// --- Other riders: two training on treadmills, one cruising the roads ------------
function npcRider(spot, bike) {
  const r = createRider(scene, { pools: null })
  r.setBike(bike)
  r.setAvatar(buildDefaultCharacter())
  const tag = label(spot.name, 0.42, { color: '#e9ecf5', outline: '#1d2236', outlineWidth: 8 })
  tag.position.y = 2.9
  r.group.add(tag)
  return r
}
const npcs = [] // fake riders removed
const CRUISE = [[0, -36], [0, 0], [38, 0], [0, 0], [0, 34], [0, 0], [-34, 0], [0, 0]]
const cruiser = null

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  rider.setVisible(mode !== 'player') // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn, music: musicToggle, musicOn: isMusicOn })
const hud = createHud()
initNet() // game server: saves, leaderboards, presence (solo if unreachable)
installAudioHooks()
Object.assign(audio, sfx, worldSfx, { setEngine, setBoulders, setAltitude, npcClaim: () => {} })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0

const last = { x: player.position.x, z: player.position.z }
const active = new Set() // triggers the player is inside
const hudInfo = { boulder: 'SLOW', prompt: null }
let crushed = 0 // s left squashed flat
let returning = 0 // s until the win-pad teleport
let shake = 0 // trauma 0..~1.5: hits add to it, it bleeds away; the camera shakes by trauma^2
let rumble = 0 // steady shake from boulders rolling nearby
const haze = document.createElement('div') // dust in the air when a boulder is right on top of you
haze.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;background:radial-gradient(ellipse at 50% 60%, rgba(214,150,96,0) 30%, rgba(196,128,78,0.55) 75%, rgba(170,104,60,0.85) 100%);transition:opacity .15s'
document.body.appendChild(haze)
const buzz = (ms) => {
  if (!COARSE_POINTER) return
  try {
    navigator.vibrate?.(ms)
  } catch {
    // not allowed here
  }
}
let popupTimer = 0
let popupGain = 0
let wasInCave = false
let devCrush = false // dev ?squash=1
let wasGrounded = true
let fallSpeed = 0
let lastSpeed = state.speed

// Boxity's death screen (required where players can die): it counts down, the player taps
// Respawn, and the game only respawns once the SDK says the countdown is over.
let dead = null
function showDeath() {
  const handle = bloxity.showDeathScreen()
  if (!handle) return false
  const btn = document.createElement('button')
  btn.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;min-width:200px;min-height:56px;padding:12px 28px;font:700 22px Fredoka,sans-serif;border-radius:16px;border:4px solid #1d1238;color:#fff;touch-action:manipulation;cursor:pointer'
  const label = (n) => {
    btn.textContent = n > 0 ? String(n) : 'RESPAWN'
    btn.disabled = n > 0
    btn.style.background = n > 0 ? '#8a8f9c' : '#2fbf4a'
  }
  label(4)
  handle.onCountdown?.(label)
  btn.addEventListener('click', () => {
    if (handle.respawn()) finishDeath()
  })
  document.body.appendChild(btn)
  dead = { btn }
  return true
}
function finishDeath() {
  dead?.btn.remove()
  dead = null
  bloxity.hideDeathScreen()
  clearFail()
  sendToStart()
  audio.respawn?.()
}
// Back to normal after a crush / fall / burn: control back, the rider upright again.
function clearFail() {
  failing = null
  failPose = null
  player.frozen = false
  player.pinned = false
  rider.group.scale.set(1, 1, 1)
  rider.group.rotation.x = rider.group.rotation.z = 0
}

// The start of the world's course (the hill: the start pad; the jungle / volcano: the gate).
function sendToStart() {
  const st = worlds.course().start
  resetPlayer(st, st.facing ?? Math.PI)
  syncYawToPlayer()
  audio.teleport?.()
}

// --- Worlds 2 + 3: falls, bites, burns -----------------------------------------------------------
// course.fail() returns the animation; the player is pinned and the rider drawn at its pose.
let failing = null // { anim, t, dur }
let failPose = null
function startFail(hz, p) {
  const course = worlds.course()
  failing = { anim: course.fail(hz.kind, { x: p.x, y: p.y, z: p.z }, hz.dir), t: 0, dur: inWorld === 'w2' ? JUNGLE.failSeconds : VOLCANO.failSeconds }
  player.pinned = true
  player.frozen = true
  shake = Math.min(1.5, shake + 0.9)
  buzz([60, 40, 120])
}
function updateFail(dt) {
  failing.t += dt
  failPose = failing.anim.update(dt)
  if (failing.t >= failing.dur) {
    failing = null
    // Boxity's death screen runs the countdown; without the SDK the game respawns on its own.
    if (!showDeath()) {
      clearFail()
      sendToStart()
      audio.respawn?.()
    }
  }
}

// Travel to another world (Worlds menu, portals, a loaded save): sky, sounds, spawn.
function travel(id) {
  if (id === inWorld || !worlds.entry(id)) return
  if (dead) {
    dead.btn.remove()
    dead = null
    bloxity.hideDeathScreen()
  }
  clearFail()
  crushed = 0
  returning = 0
  inWorld = id
  worlds.enter(id)
  respawn()
  last.x = player.position.x
  last.z = player.position.z
  pack.rebuild(player.position)
  setWorldSound(id)
  audio.teleport?.()
  audio.worldArrive?.()
  rumble = 0
  haze.style.opacity = '0'
  audio.setBoulders?.([])
  const w = worldDef(id)
  if (id !== 'w1') toast(`${w.emoji ?? ''} Welcome to ${w.name}! x${w.bonus} Speed here`, 'reward')
  setTimeout(() => confetti(player.position.x, player.position.y, player.position.z, 70), 50)
}
function confetti(x, y, z, n = 40) {
  const colors = ['#ffd21f', '#38e1ff', '#ff3d8b', '#8ef03c']
  for (let i = 0; i < n; i++) pools.glow.spawn({ ...sparkleParticle(x, y + 0.5, z, colors[i % 4], 1.5), vy: 3 + Math.random() * 5, gravity: -7, life: 1.5 })
}
function dustBurst(x, y, z, n = 40) {
  for (let i = 0; i < n; i++) {
    pools.smoke.spawn({ x: x + (Math.random() - 0.5) * 3, y: y + 0.3, z: z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 9, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 9, life: 0.8 + Math.random() * 0.8, c0: [0.85, 0.66, 0.5, 0.8], c1: [0.95, 0.88, 0.8, 0], s0: 0.8, s1: 3.2, drag: 3 })
  }
}

// Boulder hits / thumps near p: camera shake, buzz, impact sounds; then the rumble and dust haze.
function laneFx(events, p, src = lane) {
  for (const ev of events) {
    if (ev.type === 'shatter') {
      const d = Math.hypot(ev.at.x - p.x, ev.at.y - p.y, ev.at.z - p.z)
      audio.boulderImpact?.(d)
      audio.boulderShatter?.(d)
      const k = Math.max(0, 1 - d / 110)
      shake = Math.min(1.5, shake + k * 1.1)
      if (k > 0.4) buzz(120)
    } else if (ev.type === 'thump') {
      const d = Math.hypot(ev.at.x - p.x, ev.at.y - p.y, ev.at.z - p.z)
      const k = Math.max(0, 1 - d / 75) * ev.strength
      shake = Math.min(1.5, shake + k * 0.55)
      if (k > 0.35) buzz(Math.round(25 + k * 40))
    }
  }
  rumble = 0
  const near = src.nearest(p.x, p.y, p.z)
  for (const b of near) rumble = Math.max(rumble, Math.pow(Math.max(0, 1 - b.distance / 65), 1.6))
  haze.style.opacity = String(Math.min(0.9, Math.pow(Math.max(0, rumble - 0.35) / 0.65, 1.5)))
  audio.setBoulders?.(near)
}

// Worlds 2 + 3 each frame: hazards, pads, fails and the course's own camera shakes.
function worldFx(dt, t, p) {
  const course = worlds.course()
  const evs = course.update(dt, t, p, true, bouldersStopped()) ?? []
  for (const ev of evs) if (ev.type === 'shake') shake = Math.min(1.5, shake + ev.k)
  // the boulders: impact shakes, rumble, dust haze, rumble sound (same as the hill)
  laneFx(evs, p, course.rollers)
  if (failing) return updateFail(dt)
  if (dead || returning || player.pinned) return
  const hz = course.hazard(p)
  if (hz) return startFail(hz, p)
  const pad = course.padAt(p)
  if (pad) {
    const w = addWins(pad.wins)
    winSplash(w, pad.summit ? (inWorld === 'w2' ? 'Temple! Return' : 'Crater! Return') : undefined)
    audio.winClaim?.(w)
    confetti(p.x, p.y, p.z, pad.summit ? 90 : 40)
    returning = 0.45
  }
}
const allTriggers = [...zones.triggers, ...worlds.triggers]

// Smooth shake (layered sines, not white noise): position jolt, a little roll and an FOV punch.
function applyShake(dt, t) {
  const amp = Math.min(1.3, shake * shake + rumble * 0.35)
  if (amp > 0.002) {
    const n = (f, o) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.17 + o * 1.7) * 0.4
    camera.position.x += n(31, 0) * amp * 0.75
    camera.position.y += n(37, 2) * amp * 0.6
    camera.position.z += n(29, 4) * amp * 0.45
    camera.rotateZ(n(23, 6) * amp * 0.045)
    camera.fov += amp * 4
    camera.updateProjectionMatrix()
  }
  shake *= Math.exp(-3.2 * dt)
}

// Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s), and the
// intro knows whether this is a new player (it waits up to INTRO.waitForSave for the save).
function checkLoading(dt) {
  if (!shownLoading) return
  readySince += dt
  if ((avatarReady || readySince > 5) && !intro?.waiting) {
    shownLoading = false
    bloxity.notifyFirstFrame()
  }
}

// --- New-player intro (game/intro.js): a short film on the hill before the first game ---------
// While it plays the loop only animates the world: no physics, input, training or HUD.
let intro = null
if (introAllowed()) {
  intro = createIntro({
    camera,
    rider,
    lane,
    pack,
    onCrush(at) {
      shake = 1.5
      buzz([60, 40, 120])
      audio.crush?.(0)
      dustBurst(at.x, at.y, at.z, 60)
    },
    onDone() {
      intro = null
      rider.group.scale.set(1, 1, 1)
      rider.setTrail(TRAILS.find((t) => t.id === state.trail)?.color ?? null)
      rider.setVisible(!isFirstPerson())
      pack.rebuild(player.renderPosition)
      syncYawToPlayer()
    },
  })
}
function runIntro(dt, t) {
  const film = intro
  laneFx(lane.update(dt, t, true), film.focus) // no random boulders: the film brings its own
  const f = film.update(dt, t, shownLoading) // holds its first frame while the loading screen is up
  pack.update(dt, t, { x: f.x, y: f.y, z: f.z, facing: Math.PI })
  remotes.update(dt, t)
  zones.update(dt, t)
  for (const pool of Object.values(pools)) pool.update(dt, t)
  popups.update(dt)
  audio.setEngine?.({ speed: film.speed, throttle: film.speed > 0.5 ? 1 : 0, uphill: 0, onTreadmill: false })
  audio.setAltitude?.(Math.max(0, f.y))
  applyShake(dt, t)
  world.update(dt, t)
  lighting.update(dt, f)
  postfx.render()
  checkLoading(dt)
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const t = clock.elapsedTime
  if (paused) return // an ad break is playing
  if (intro) return runIntro(dt, t)

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()
  // A fail animation (flung into the river, sinking in lava): the camera watches it from above.
  if (failPose) {
    const r = player.renderPosition
    r.x += (failPose.x - r.x) * Math.min(1, dt * 6)
    r.z += (failPose.z - r.z) * Math.min(1, dt * 6)
    r.y += (Math.max(failPose.y + 5, 1.5) - r.y) * Math.min(1, dt * 4)
  }

  const p = player.renderPosition
  const moved = Math.hypot(p.x - last.x, p.z - last.z)
  const teleported = moved > 6 // respawn / teleport
  last.x = p.x
  last.z = p.z
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  const throttle = Math.min(1, Math.max(Math.hypot(inputState.move.x, inputState.move.z), Math.abs(inputState.drive.throttle)))

  // Zone triggers: prompts, enter events and treadmills.
  let prompt = null
  let afkMult = 0
  for (const trig of allTriggers) {
    const inside = trig.test(p.x, p.z)
    if (inside && !active.has(trig)) {
      active.add(trig)
      trig.enter?.()
    } else if (!inside) active.delete(trig)
    if (!inside) continue
    if (trig.afk) afkMult = Math.max(afkMult, trig.afk())
    prompt ||= trig.prompt?.() ?? null
  }
  const onTreadmill = afkMult > 0 && speed < 1.5
  const course = worlds.course()
  train(dt, { riding: !crushed && !failing && speed > ECONOMY.minRideSpeed, afkMult: onTreadmill ? afkMult : 0, hill: course.trainAt(p.x, p.z) })

  // "+216" popups: the speed earned over the last second, floating off the bike.
  popupGain += Math.max(0, state.speed - lastSpeed)
  lastSpeed = state.speed
  popupTimer += dt
  if (popupTimer >= LANE.popupEvery) {
    popupTimer = 0
    // Whole speed only; the fraction carries over so a steady +1/s never shows 0 or +2 by rounding.
    const shown = Math.floor(popupGain + 1e-6)
    if (shown >= 1) {
      popups.speed(shown, p)
      audio.speedTick?.()
      popupGain -= shown
    }
  }

  // --- The hill: boulders, crushing, win pads -------------------------------------
  {
    const inCave = inWorld === 'w1' && Math.abs(p.x) > LANE.halfWidth - 0.2 && !!caves.find((c) => Math.abs(sAt(p.z) - c.s) < LANE.caves.width / 2)
    if (inCave && !wasInCave) audio.caveEnter?.()
    wasInCave = inCave
    if (wasGrounded && !player.grounded && player.velocity.y > 3) audio.jump?.()
    if (!wasGrounded && player.grounded && fallSpeed < -5) audio.land?.(Math.min(1, -fallSpeed / 20))
    fallSpeed = player.grounded ? 0 : Math.min(fallSpeed, player.velocity.y)
    wasGrounded = player.grounded
  }
  if (inWorld === 'w1') laneFx(lane.update(dt, t, bouldersStopped()), p)
  else worldFx(dt, t, p)
  laneRiders.update(dt, t, (at) => {
    dustBurst(at.x, at.y, at.z, 30)
    const d = Math.hypot(at.x - p.x, at.z - p.z)
    if (d < 60) audio.crush?.(d)
  })
  if (inWorld === 'w1' && !crushed && !dead && (lane.crushes(p.x, p.z, p.y) || devCrush)) {
    devCrush = false
    crushed = LANE.crushSeconds
    player.frozen = true
    player.velocity.x = player.velocity.z = 0
    shake = 1.5
    buzz([60, 40, 120])
    audio.crush?.(0)
    dustBurst(p.x, p.y, p.z, 60)
  }
  if (crushed > 0) {
    crushed -= dt
    const k = Math.min(1, (LANE.crushSeconds - crushed) / 0.08)
    rider.group.scale.set(1 + 0.6 * k, 1 - 0.86 * k, 1 + 0.6 * k)
    if (crushed <= 0) {
      crushed = 0
      // Boxity's death screen runs the countdown; without the SDK the game respawns on its own.
      if (!showDeath()) {
        player.frozen = false
        rider.group.scale.set(1, 1, 1)
        sendToStart()
        audio.respawn?.()
      }
    }
  }
  if (inWorld === 'w1' && !crushed && !returning) {
    const sp = sAt(p.z)
    for (const c of caves) {
      if (c.pad && Math.abs(p.x - c.pad.x) < 2.7 && Math.abs(sp - c.s) < 2.5) {
        const w = addWins(c.wins)
        winSplash(w)
        audio.winClaim?.(w)
        confetti(p.x, p.y, p.z)
        returning = 0.45
        break
      }
    }
    if (!returning && sp > laneLength - 7.5 && Math.abs(p.x) < LANE.halfWidth * 0.85) {
      const w = addWins(lane.summit.wins)
      winSplash(w, 'Summit! Return')
      audio.winClaim?.(w)
      confetti(p.x, p.y, p.z, 90)
      returning = 0.45
    }
  }
  if (returning > 0) {
    returning -= dt
    if (returning <= 0) {
      returning = 0
      sendToStart()
    }
  }

  const fp = failPose
  rider.update(dt, t, {
    x: fp ? fp.x : p.x,
    y: fp ? fp.y : p.y,
    z: fp ? fp.z : p.z,
    facing: player.facing,
    speed: fp ? 0 : onTreadmill ? 9 : speed,
    distance: fp ? 0 : onTreadmill ? 9 * dt : teleported ? 0 : moved,
    grounded: fp ? true : player.grounded,
    vy: fp ? 0 : player.velocity.y,
    throttle: crushed || fp ? 0 : throttle,
    ground: course.ground(p.x, p.z),
  })
  if (fp) {
    const sq = fp.squash ?? 1
    rider.group.rotation.x = fp.pitch ?? 0
    rider.group.rotation.z = fp.roll ?? 0
    rider.group.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6)
  }
  pack.update(dt, t, { x: fp ? fp.x : p.x, y: fp ? Math.max(fp.y, p.y - 1) : p.y, z: fp ? fp.z : p.z, facing: player.facing })
  remotes.update(dt, t)
  sendPose({ x: p.x, y: p.y, z: p.z, yaw: player.facing, speed: onTreadmill ? 9 : speed })

  for (const n of npcs) n.r.update(dt, t, { x: n.spot.x, y: n.spot.y, z: n.spot.z, facing: n.spot.facing, speed: 8, distance: 8 * dt, grounded: true })
  if (cruiser) {
    const c = cruiser
    const [wx, wz] = CRUISE[c.wp]
    const dx = wx - c.x
    const dz = wz - c.z
    if (Math.hypot(dx, dz) < 3) c.wp = (c.wp + 1) % CRUISE.length
    const want = Math.atan2(dx, dz)
    const diff = Math.atan2(Math.sin(want - c.facing), Math.cos(want - c.facing))
    c.facing += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff))
    const v = Math.abs(diff) > 1.2 ? 6 : 13
    c.x += Math.sin(c.facing) * v * dt
    c.z += Math.cos(c.facing) * v * dt
    c.r.update(dt, t, { x: c.x, y: 0, z: c.z, facing: c.facing, speed: v, distance: v * dt, grounded: true })
  }

  zones.update(dt, t)
  worlds.update(dt, t)
  for (const pool of Object.values(pools)) pool.update(dt, t)
  hudInfo.boulder = inWorld === 'w1' ? lane.mode() : worlds.course().mode?.() ?? lane.mode()
  hudInfo.prompt = prompt
  hud.update(dt, hudInfo)

  popups.update(dt)
  audio.setEngine?.({ speed: crushed || failing ? 0 : onTreadmill ? 9 : speed, throttle, slip: rider.slip, air: rider.airborne, uphill: inWorld === 'w1' ? Math.sin(angleAt(sAt(p.z))) * Math.min(1, speed / 4) : 0, onTreadmill })
  audio.setAltitude?.(course.altitude(p))

  updateCamera(camera, dt)
  applyShake(dt, t)
  world.update(dt, t)
  lighting.update(dt, p)
  postfx.render()
  checkLoading(dt)
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  // __game.travel('w2') unlocks (dev) and travels; ?world=w2|w3 does it on load.
  const devTravel = (id) => {
    if (!state.worlds.includes(id)) state.worlds.push(id)
    travelTo(id)
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, state, rider, pools, lane, remotes, net, worlds, travel: devTravel, pause: (v) => (paused = v), intro: () => intro }
  const goWorld = new URLSearchParams(location.search).get('world')
  if (goWorld && WORLDS.some((w) => w.id === goWorld)) setTimeout(() => devTravel(goWorld), 300)
  // ?tp=x,z,facingDeg puts the player there on load (for screenshots).
  const tp = new URLSearchParams(location.search).get('tp')
  if (tp) {
    const [x, z, f = 180] = tp.split(',').map(Number)
    setTimeout(() => {
      const o = worldDef().origin
      teleport(o.x + x, inWorld === 'w1' ? heightAt(sAt(z)) + 0.5 : 0.6, o.z + z, (f * Math.PI) / 180)
    }, goWorld ? 500 : 0)
  }
  if (new URLSearchParams(location.search).get('squash')) setTimeout(() => (devCrush = true), 1500)
  const drop = Number(new URLSearchParams(location.search).get('boulder'))
  if (drop) setTimeout(() => {
    lane.spawnAt(drop)
    // ?warm=N: simulate N frames of the hill at once (headless screenshots run at a crawl)
    const warm = Number(new URLSearchParams(location.search).get('warm'))
    for (let i = 0; i < warm; i++) {
      lane.update(1 / 30, i / 30, false)
      for (const pool of Object.values(pools)) pool.update(1 / 30, i / 30)
    }
  }, 200)
  const zoom = Number(new URLSearchParams(location.search).get('zoom'))
  if (zoom) inputState.zoom += zoom // wheel notches, + = farther
  const orbit = Number(new URLSearchParams(location.search).get('orbit'))
  if (orbit) setTimeout(() => (inputState.look.dx += (orbit * Math.PI) / 180 / CAMERA.lookSensitivity), 300) // degrees round the player
}
