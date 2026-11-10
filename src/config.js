// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'impossible-hill-climb' // slug registered on bloxity.io
export const GAME_TITLE = 'Impossible Hill Climb'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- Game server (Colyseus, ../Bowling-roll-backend) ---------------------------------
// VITE_SERVER_URL wins; dev builds fall back to the local backend (npm start, port 2567).
// Otherwise the Bloxity SDK resolves the endpoint (bloxity.resolveServerEndpoint). No server =
// solo play (nothing is saved without the server).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? "ws://localhost:2567" : "")
export const NET = {
  saveDebounce: 1.5, // s of quiet after a change before saving
  saveMaxWait: 8, // s: a stream of changes still saves this often
  retry: 10, // s between connection attempts while the server is unreachable
  poseEvery: 0.1, // s between `pose` messages (others ease toward them)
}

// Bloxity leaderboards (Boxity draws the trophy button + panel). Declared at boot with
// leaderboard.define(); the first declaration creates a board. Keep in step with the backend's
// BLOXITY_BOARDS (src/bloxityBoards.ts), which reports the scores from saved state; `stat` is the
// `state` key each board ranks.
export const LEADERBOARDS = [
  { id: 'wins', label: 'Wins', order: 'desc', mode: 'best', format: 'compact', stat: 'wins' },
  { id: 'speed', label: 'Speed', order: 'desc', mode: 'best', format: 'compact', stat: 'speed' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', stat: 'rebirths' },
  { id: 'played', label: 'Time Played', order: 'desc', mode: 'best', format: 'time', stat: 'played' },
]

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The lobby (world.js + zones/): a flat asphalt hub with raised grass islands,
// four zones off a central crossroads and terraced voxel cliffs all round.
// The lane past the start band (north) is not built yet: a barrier closes it.
export const LOBBY = {
  bounds: { minX: -70, maxX: 70, minZ: -62, maxZ: 72 }, // asphalt hub; cliffs start outside
  roadHalf: 5, // half-width of the four roads
  laneMouth: { halfWidth: 16, z: -62 }, // gap in the north cliffs where the lane will start
  startPad: { minX: -16, maxX: 16, minZ: -60, maxZ: -44 },
  band: { minZ: -61.6, maxZ: -60 }, // the checkered start band
  garage: { minX: -68, maxX: -44, minZ: -24, maxZ: 24 }, // west
  afk: { minX: 44, maxX: 68, minZ: -24, maxZ: 24 }, // east
  hatchery: { minX: -16, maxX: 16, minZ: 48, maxZ: 72 }, // south
  tees: {
    west: { minX: -44, maxX: -36, minZ: -24, maxZ: 24 },
    east: { minX: 36, maxX: 44, minZ: -24, maxZ: 24 },
    south: { minX: -28, maxX: 28, minZ: 40, maxZ: 48 },
  },
  studTile: 1.2, // m per stud texture tile (4 x 4 studs)
  colors: {
    grass: '#7ee020',
    grassCap: '#a8f238',
    asphalt: '#5d5a5e',
    curb: '#f4f4f4',
    dash: '#ffd21f',
    dirt: '#c8693a',
    stone: '#a7a7ab',
    trunk: '#8a5530',
    leaves: ['#3fbf3f', '#5bd64a', '#2ea33a', '#8fe04a'],
  },
}
export const SPAWN = { x: 0, y: 0.05, z: 6 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z, the start band)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 15, // m/s riding in the lobby
  sprintSpeed: 24, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.65, // m autostep (bike rolls up curbs, decks and treadmills)
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 220, far: 700 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1a7cff',
    horizon: '#b8ecff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.6,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#9ad06a',
    hemiIntensity: 0.9,
    envIntensity: 0.45,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 55, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.3, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 15, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 40,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
  // Seated on a bike (avatar/animator.js 'ride' state): thighs forward, knees bent, hands on the bars.
  ride: {
    pose: {
      LegL1: { x: deg(-82), z: deg(-8) }, LegR1: { x: deg(-82), z: deg(8) },
      LegL2: { x: deg(88) }, LegR2: { x: deg(88) },
      ArmL1: { x: deg(-62), z: deg(16) }, ArmR1: { x: deg(-62), z: deg(-16) },
      ArmL2: { x: deg(28) }, ArmR2: { x: deg(28) },
      Spine1: { x: deg(16) }, Spine2: { x: deg(6) }, Neck1: { x: deg(-16) },
    },
    tuck: deg(10), // extra forward lean at full speed
    throttleTuck: deg(5), // and a little more while the throttle is open
    lookTurn: deg(18), // head turns into a corner
    turnRoll: deg(9), // upper body hangs into the corner on top of the bike's lean
    squatSpine: deg(18), // landing compression: chest drops toward the tank
    squatElbow: deg(34), // elbows fold to soak the hit
    squatKnee: deg(16),
    wheelieLean: 0.7, // the rider leans forward this much of a wheelie's angle to hold the front down
    airThigh: deg(24), // in the air the rider rises onto the pegs: thighs drop, knees open
    airKnee: deg(20),
    airElbow: deg(14),
    idleLook: deg(14), // stopped: the head drifts side to side
  },
}

// Riding feel (game/rider.js): how the bike's body moves under the rider and what it throws up.
// Springs are k (1/s^2) + damping (1/s). Angles in radians, distances in m, speeds in m/s.
export const RIDE = {
  // Suspension: landing speed (m/s) x `land` = compression velocity; body travel min..max m;
  // the rider dips `riderExtra` x as far again (legs + arms soak it up).
  suspension: { k: 260, damp: 15, land: 0.3, min: -0.2, max: 0.07, riderExtra: 0.7 },
  // Pitch about the rear tyre: rad per m/s^2 of acceleration (squat nose-up / brake dive), limits,
  // and the nose-down kick per m/s of landing speed.
  pitch: { k: 150, damp: 12, accel: 0.02, maxUp: 0.13, maxDive: 0.07, land: 0.05 },
  // Launch wheelie: throttle snapped open below maxSpeed lifts the front `angle` rad for `time` s.
  wheelie: { angle: 0.22, time: 0.6, throttle: 0.6, maxSpeed: 4 },
  // Ground pitch follows the slope under the tyres (smoothing rates 1/s); in the air the nose
  // follows the arc (`air` x the flight-path angle).
  slope: { rate: 10, max: 0.8, airRate: 3, air: 0.55, airMax: 0.45 },
  lean: { k: 0.045, max: 0.6, rate: 7 },
  // Tyre slip 0..1 (squeal + drift smoke): lateral acceleration (m/s^2) where it starts, and the span to full.
  slip: { from: 20, range: 30, minSpeed: 6 },
  // Engine shake of the body (m): standing, extra per throttle at a stand, and road buzz at speed.
  shake: { idle: 0.004, rev: 0.006, road: 0.0022 },
  // Particles (x the graphics preset's particle scale). Rates per s.
  fx: {
    exhaust: { base: 3, perSpeed: 0.7, perThrottle: 9 },
    dust: { from: 2, perSpeed: 1.7, max: 55, liteScale: 0.35 },
    smoke: 34, // drift smoke at full slip
    motes: { from: 18, per: 2.2, max: 45 }, // speed motes streaming past the camera
    landing: { base: 10, per: 34 },
    backfire: 9,
  },
  // Dust colours [start rgb, end rgb]: hub asphalt, the orange hill lane.
  dust: {
    road: [[0.55, 0.54, 0.57], [0.78, 0.77, 0.8]],
    lane: [[0.95, 0.52, 0.26], [1, 0.82, 0.62]],
  },
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =============================================================================
// Game content: bikes, pets, eggs, treadmills, trails and the economy.
// =============================================================================

// Bike garage (west), in unlock order. style picks the model in lobby/bikes.js:
// 'scooter' | 'dirt' | 'sport' | 'cruiser' | 'chopper' | 'hyper' | 'flame'.
// perSpeed = speed earned per training tick; wins = wins needed to unlock (free once unlocked).
// Thresholds are paced for the ~6 h climb (see LANE.need): a new bike every few minutes early,
// every 30-60 min late; Nebula X comes in the last stretch before the summit.
export const BIKES = [
  { id: 'zippy', name: 'Zippy Scooter', style: 'scooter', body: '#5fd3f5', accent: '#ffffff', rim: '#d9f6ff', perSpeed: 1, wins: 0 },
  { id: 'mudhopper', name: 'Mud Hopper', style: 'dirt', body: '#8ee03c', accent: '#2a2a2a', rim: '#f2f2f2', perSpeed: 4, wins: 25 },
  { id: 'streetdart', name: 'Street Dart', style: 'sport', body: '#e8262e', accent: '#ffffff', rim: '#e8262e', perSpeed: 10, wins: 150 },
  { id: 'thunder', name: 'Thunder Cruiser', style: 'cruiser', body: '#8a1820', accent: '#1a1a1a', rim: '#c0c0c0', perSpeed: 20, wins: 600 },
  { id: 'blaze', name: 'Blaze Runner', style: 'sport', body: '#ff8a1f', accent: '#d8dde6', rim: '#333333', perSpeed: 45, wins: 2000 },
  { id: 'dune', name: 'Dune Chopper', style: 'chopper', body: '#d33a2a', accent: '#151515', rim: '#ffcc33', perSpeed: 80, wins: 6000 },
  { id: 'volt', name: 'Volt Racer', style: 'sport', body: '#ffd21f', accent: '#e8262e', rim: '#222222', perSpeed: 150, wins: 15000 },
  { id: 'phantom', name: 'Pink Phantom', style: 'hyper', body: '#ff3d8b', accent: '#ffffff', rim: '#ff3d8b', neon: '#ff5fb0', perSpeed: 300, wins: 35000 },
  { id: 'cobalt', name: 'Cobalt Storm', style: 'sport', body: '#1f5fff', accent: '#0b1a3a', rim: '#9fd0ff', perSpeed: 600, wins: 70000 },
  { id: 'nebula', name: 'Nebula X', style: 'hyper', body: '#7a2cff', accent: '#c9a2ff', rim: '#b06bff', neon: '#c56bff', perSpeed: 1500, wins: 150000 },
]
// Premium bikes shown on glowing rings by the start pad (bought with wins).
export const FEATURED_BIKES = [
  { id: 'solarflare', name: 'Solar Flare', style: 'flame', body: '#ffb020', accent: '#2a1205', rim: '#ff6a00', neon: '#ffae2b', perSpeed: 5000, wins: 600000, featured: true, stock: 3000, sold: 2340, tag: 'LEGENDARY BIKE', ring: '#ffc21f' },
  { id: 'voidstreak', name: 'Voidstreak', style: 'hyper', body: '#2b1f6e', accent: '#e8b84a', rim: '#38e1ff', neon: '#38e1ff', perSpeed: 3500, wins: 350000, featured: true, tag: 'LIMITED!', ring: '#38e1ff' },
]
// Prize bikes (never sold): owned once won. prize: 'spin' (wheel) | 'daily' (Day 7 reward).
// Astral Wing stays below Nebula X: a lucky first spin is a head start, not a skip to the summit.
export const PRIZE_BIKES = [
  { id: 'astralwing', name: 'Astral Wing', style: 'hyper', body: '#8a3cff', accent: '#e9d4ff', rim: '#ff5fd8', neon: '#c56bff', perSpeed: 1200, prize: 'spin' },
  { id: 'metalline', name: 'Metalline Bike', style: 'sport', body: '#c9d6e6', accent: '#2a3550', rim: '#38e1ff', neon: '#38e1ff', perSpeed: 900, prize: 'daily' },
]
export const ALL_BIKES = [...BIKES, ...FEATURED_BIKES, ...PRIZE_BIKES]

// Pets follow the player in a little pack; each equipped pet multiplies Speed gains by mult.
// kind picks the model in lobby/pets.js: 'dog' | 'chicken' | 'cow' | 'goat' | 'horse' | 'bull' | 'llama' |
// 'seahorse' | 'crab' | 'pufferfish' | 'shark' | 'kraken' | 'stingray' (sea kinds float), also the older
// 'cat' | 'bunny' | 'pig' | 'fox' | 'panda' | 'dragon'. Dogs: ears 'butterfly' | 'floppy' | 'bat' | 'pointy',
// fluffy, bow (ribbon colour); any kind: size (scale, default 1).
export const PETS = {
  // Dog Egg
  papillon: { name: 'Papillon', kind: 'dog', ears: 'butterfly', color: '#ffffff', spot: '#7a3e1c', mult: 1.04, rarity: 'Common' },
  maltese: { name: 'Maltese', kind: 'dog', ears: 'floppy', fluffy: true, bow: '#e8262e', color: '#ffffff', spot: '#f1ece6', mult: 1.02, rarity: 'Common' },
  boston: { name: 'Boston Terrier', kind: 'dog', ears: 'bat', color: '#1d1d22', spot: '#ffffff', mult: 1.08, rarity: 'Uncommon' },
  akita: { name: 'Akita', kind: 'dog', ears: 'pointy', color: '#ff9a3a', spot: '#ffffff', mult: 1.15, rarity: 'Rare' },
  golden: { name: 'Golden Retriever', kind: 'dog', ears: 'floppy', color: '#f2c14a', spot: '#d99a2a', mult: 1.3, rarity: 'Epic' },
  greatdane: { name: 'Great Dane', kind: 'dog', ears: 'floppy', size: 1.3, color: '#2a2a30', spot: '#141418', mult: 2.5, rarity: 'Mythic' },
  // Cow Egg
  chicken: { name: 'Chicken', kind: 'chicken', color: '#ffffff', spot: '#ff3b30', mult: 1.12, rarity: 'Common' },
  cow: { name: 'Cow', kind: 'cow', color: '#ffffff', spot: '#1d1d22', mult: 1.08, rarity: 'Common' },
  goat: { name: 'Goat', kind: 'goat', color: '#f4ead2', spot: '#b8a47a', mult: 1.25, rarity: 'Uncommon' },
  horse: { name: 'Horse', kind: 'horse', color: '#8a4b26', spot: '#3a2010', mult: 2, rarity: 'Epic' },
  bull: { name: 'Bull', kind: 'bull', color: '#6a3418', spot: '#2a1408', mult: 6, rarity: 'Mythic' },
  llama: { name: 'Llama', kind: 'llama', color: '#f6f0e0', spot: '#d9c9a8', mult: 1.5, rarity: 'Rare' },
  // Crab Egg
  seahorse: { name: 'Seahorse', kind: 'seahorse', color: '#f2c96a', spot: '#c9963a', mult: 1.6, rarity: 'Common' },
  crab: { name: 'Crab', kind: 'crab', color: '#e8262e', spot: '#ffb020', mult: 1.4, rarity: 'Common' },
  pufferfish: { name: 'Pufferfish', kind: 'pufferfish', color: '#ffd27a', spot: '#c98a2a', mult: 1.8, rarity: 'Uncommon' },
  shark: { name: 'Shark', kind: 'shark', color: '#3a8fe8', spot: '#ffffff', mult: 3.5, rarity: 'Epic' },
  kraken: { name: 'Kraken', kind: 'kraken', color: '#3d5bd8', spot: '#8aa6ff', mult: 20, rarity: 'Mythic' },
  stingray: { name: 'Stingray', kind: 'stingray', color: '#e8d6a0', spot: '#b8a070', mult: 2.5, rarity: 'Rare' },
}
// Pet slots: equipped at once / owned at most. The [+] buttons in the Pets panel buy more
// (premium: +petSlotStep equip slots, +petStorageStep storage).
export const PET_LIMITS = { slots: 3, storage: 50, slotStep: 1, storageStep: 25, maxSlots: 8, maxStorage: 500, slotPrice: 149, storagePrice: 49 }
export const MAX_EQUIPPED_PETS = PET_LIMITS.slots
export const STARTER_PET = 'papillon'
// Eggs on the hatchery pedestals (south); cost is in wins, pets are [id, chance %] in the
// order the egg popup shows them (3 x 2). tier is the word above the egg.
export const EGGS = [
  { id: 'dog', name: 'Dog Egg', tier: 'Common', cost: 150, color: '#ffffff', spots: '#7a3e1c', label: '#ffffff', pets: [['papillon', 29], ['maltese', 54], ['boston', 12], ['golden', 1.59], ['greatdane', 0.01], ['akita', 3.4]] },
  { id: 'cow', name: 'Cow Egg', tier: 'Rare', cost: 2500, color: '#ffffff', spots: '#1d1d22', label: '#21d8ff', pets: [['chicken', 29], ['cow', 54], ['goat', 12], ['horse', 1.59], ['bull', 0.01], ['llama', 3.4]] },
  { id: 'crab', name: 'Crab Egg', tier: 'Legendary', cost: 12000, color: '#ff5a3a', spots: '#ffb020', label: '#ffb020', pets: [['seahorse', 29], ['crab', 54], ['pufferfish', 12], ['shark', 1.59], ['kraken', 0.01], ['stingray', 3.4]] },
]
// Egg popup: auto-hatch waits this long between eggs (s).
export const HATCH = { autoDelay: 0.4 }

// AFK zone treadmills (east), listed north -> south. Standing on one trains
// at mult x. req: { level } or { rebirths } to use it. size: undefined | 'lg' | 'xl'.
export const TREADMILLS = [
  { mult: 100, color: '#ff7a00', alt: '#1d1d1d', req: { rebirths: 10 }, size: 'xl', vortex: true },
  { mult: 25, color: '#b04bff', req: { rebirths: 3 }, size: 'lg', glow: true },
  { mult: 3, color: '#ffd21f', req: { rebirths: 1 } },
  { mult: 1, color: '#6f97d8' },
  { mult: 1, color: '#6f97d8' },
  { mult: 1, color: '#6f97d8' },
  { mult: 3, color: '#ff5fbf', req: { rebirths: 1 } },
  { mult: 3, color: '#ffd21f', req: { rebirths: 1 } },
  { mult: 9, color: '#1fb6ff', req: { rebirths: 2 }, size: 'lg', glow: true },
]

// Trails drawn behind the bike (Trails menu, best first). Owned trails are kept in
// state.ownedTrails; the equipped one multiplies Speed gains by mult. Bought with wins
// and/or gems (premium; was = struck-through old price), or a prize: 'daily' (Day 5 reward)
// / 'spin' (wheel only). The orange one is also a spin wheel prize.
export const TRAILS = [
  { id: 'rainbow', name: 'Rainbow Trail', color: 'rainbow', mult: 15, wins: 500000, look: 'rainbow' },
  { id: 'flame', name: 'Flaming Trail', color: '#ff4a12', mult: 10, wins: 100000, look: 'flame' },
  { id: 'purple', name: 'Purple Trail', color: '#a64dff', mult: 2.5, prize: 'daily', look: 'purple' },
  { id: 'orange', name: 'Orange Trail', color: '#ff9a1f', mult: 2.5, wins: 12000, look: 'orange' },
  { id: 'green', name: 'Green Trail', color: '#5fe04c', mult: 2, wins: 3000, look: 'green' },
  { id: 'blue', name: 'Blue Trail', color: '#21b8ff', mult: 1.5, wins: 200, look: 'blue' },
]

export const ECONOMY = {
  rideGainPerSec: 1, // speed per second while riding = this x bike.perSpeed x multiplier
  afkGainPerSec: 1, // per second on a treadmill = this x treadmill mult x bike.perSpeed x multiplier
  minRideSpeed: 2, // m/s: slower than this does not count as riding
  xpBase: 600, // xp for level 1 -> 2 (xp = speed earned)
  xpGrowth: 1.055, // each level needs this much more (x3.8 per +25 levels = per rebirth: rebirths every 5-50 min)
  winsPerLevel: 1, // wins granted on level up = this x the new level (the caves are the main wins source)
  rebirthBaseLevel: 25, // the max level (and the level needed to rebirth) before any rebirth
  rebirthLevelStep: 25, // + this per rebirth already done ("Max Lvl. 75" at Rebirth 2)
  rebirthBonus: 0.5, // Speed multiplier added per rebirth ("x2 Speed" at Rebirth 2)
  rebirthResetsSpeed: true, // a rebirth also resets the Speed stat (Skip Rebirth keeps both)
  skipRebirthPrice: 99, // gems (premium) for Skip Rebirth
  boostFactor: 2, // the 2x Speed / 2x Wins boosts
  chestCooldown: 900, // s between free reward chests
  chestWins: [25, 250], // random range
  adCooldown: 300, // s between rewarded-ad bonuses at the chest
  adWins: [40, 120], // a small thank-you for watching: random wins ...
  adSpeed: 800, // ... plus this much Speed
  customSpeedMax: 180, // Custom Speed slider top (race speed cap)
  devGrants: [100e3, 1e6, 10e6], // the +100K / +1M / +10M buttons
}
// Daily reward ladder (day 1..7, then it repeats).
export const DAILY_REWARDS = [
  { speed: 1500, look: 'blue', icon: 'shoe', shoe: '#4aa8ff' },
  { wins: 15, look: 'gold', icon: 'wins' },
  { speed: 5000, look: 'blue', icon: 'shoe', shoe: '#ffa21f' },
  { wins: 50, look: 'gold', icon: 'wins' },
  { trail: 'purple', dupe: { wins: 100 }, look: 'blue', icon: 'trail' },
  { speed: 10000, look: 'rainbow', icon: 'shoe', shoe: '#3a8bff' },
  { bike: 'metalline', dupe: { wins: 1000 }, look: 'rainbow', icon: 'bike' },
]
// Worlds menu. Only World 1 exists; the others show their level gate and "Coming soon".
export const WORLDS = [
  { id: 'w1', name: 'World 1', art: 'hill' },
  { id: 'w2', name: 'World 2 (Jungle)', level: 75, art: 'jungle', soon: true },
  { id: 'w3', name: 'World 3 (Lava)', level: 150, art: 'lava', soon: true },
]
// Spin wheel (hud/spinwheel.js). Spins are banked: one free spin every freeEvery s of
// play time (counted only while the tab is visible), plus the packs sold beside the
// wheel (price in gems; granted free in dev builds like every premium product).
// Slices run clockwise from the top (the pointer); chance = weight (they add to 100).
// A slice gives wins | speed | bike (PRIZE_BIKES id) | trail (TRAILS id); a bike or
// trail you already own gives `dupe` instead. icon: 'bike' | 'shoe' | 'trail' | 'wins'.
export const SPIN = {
  freeEvery: 3 * 3600,
  startSpins: 1, // a new save starts with one spin to try
  packs: [
    { spins: 1, price: 15000, look: 'blue' },
    { spins: 3, price: 36000, look: 'gold' },
    { spins: 5, price: 54000, look: 'purple' },
    { spins: 10, price: 105000, look: 'rainbow', tag: 'BEST!' },
  ],
  seconds: 5, // how long the wheel turns
  turns: 6, // full turns before it settles
  slices: [
    { lines: ['ASTRAL', 'WING'], chance: 5, bike: 'astralwing', dupe: { wins: 2000 }, color: '#c23cff', color2: '#8a1fe8', icon: 'bike' },
    { lines: ['100K', 'SPEED'], chance: 10, speed: 100000, color: 'rainbow', icon: 'shoe', shoe: '#ffa21f' },
    { lines: ['10K', 'SPEED'], chance: 20, speed: 10000, color: '#1fb0ff', color2: '#0a7fe8', icon: 'shoe', shoe: '#4aa8ff' },
    { lines: ['ORANGE', 'TRAIL'], chance: 15, trail: 'orange', dupe: { wins: 300 }, color: '#ffa21f', color2: '#ff7a00', icon: 'trail' },
    { lines: ['1K', 'SPEED'], chance: 35, speed: 1000, color: '#2cc6ff', color2: '#0d95f0', icon: 'shoe', shoe: '#7cc4ff' },
    { lines: ['100 WINS'], chance: 15, wins: 100, color: '#ffd21f', color2: '#ffae00', icon: 'wins' },
  ],
}

// --- The hill lane (lobby/lane.js) ------------------------------------------------------
// North of the start band: an orange studded slope that gets steeper the higher
// you go, terraced cliffs on both sides, safe caves cut into the walls on
// alternating sides (further apart the higher they are) with a win pad in each,
// and boulders that roll down and flatten anyone still on the open lane.
// s = metres along the lane from the band (world z = startZ - s).
export const LANE = {
  startZ: -61.6, // = LOBBY.band.minZ
  halfWidth: 16, // open lane half-width (= LOBBY.laneMouth.halfWidth)
  segments: 26,
  segLen: 24, // m per straight slope segment
  angle: [3, 34], // degrees: bottom segment .. top segment
  curve: 1.35, // >1: the slope stays gentle longer, then ramps up
  // Caves: first one `first` m up, then each gap is `gap` + `grow` x index m. Sides alternate (left first).
  caves: { first: 30, gap: 28, grow: 5, depth: 18, width: 34, height: 9.5 }, // 11 caves
  caveWins: [2, 5, 12, 25, 50, 100, 200, 350, 600, 1000, 1600],
  summitWins: 10000, // the pad at the very top
  // Riding: MAX (the HUD's "MAX: 184") comes from the Speed stat; m/s = mps.base + MAX x mps.per.
  rideMax: { base: 12, k: 20, div: 20 }, // MAX = base + k x log10(1 + speed / div): +20 MAX per x10 Speed
  mps: { base: 7, per: 0.16 },
  sprint: 1.15, // Shift on the lane
  // The MAX for full speed uphill: need.caves[k] at cave k, linear in between (half of cave 1's at
  // the band). Nothing ever stops you: below it the bike just climbs slower (x MAX/need, at least
  // need.minUp), so a weak bike spends longer on the open lane with the boulders. Shown on the cave
  // signs; the HUD's NEXT is the next cave you can't ride at full speed yet, then the dash MAX.
  // Each +20 MAX is x10 Speed, so a few points at the top are hours of play.
  need: { caves: [22, 45, 72, 98, 136, 163, 177, 190, 200, 216, 229], minUp: 0.15 },
  // The summit dash: above the last cave the summit launches a boulder `every` s after you ride out
  // onto the lane (and every `every` s while you stay), so you must reach the pad in time. The slope
  // up there is set so a sprinting bike at MAX `max` makes it exactly; below that it's too slow.
  // This is the 5 h+ goal: a perfect free player (simulated) gets MAX `max` after ~6-7 h (lucky ~5 h).
  dash: { max: 230, every: 4 },
  // Hill training: riding on the lane earns Speed x this (train.caves[k] at cave k, train.summit at
  // the top, linear in between, 1 at the band), counted only up to the height your MAX rides at full
  // speed: dodging boulders with a weak bike reaches higher caves but doesn't train faster. Riding
  // laps in your highest full-speed cave beats the treadmills. Shown on the cave signs.
  train: { caves: [1.5, 2, 4, 12, 30, 35, 40, 50, 60, 75, 110], summit: 150 },
  boulder: {
    radius: 18,
    sink: 5, // m the centre rides above the floor: the boulder is half buried and fills the lane
    spawnBack: 24, // m below the top where boulders appear
    startSpeed: 5, // m/s
    gravity: 0.5, // x g x sin(slope) acceleration down the hill
    maxSpeed: 46,
    modes: [
      // boulder speeds: launched in the current mode (it cycles every `time` s); the sign rides on the boulder
      { mode: 'VERY SLOW', face: '😄', color: '#5dff4a', time: 18, every: 13, speed: 0.55 },
      { mode: 'SLOW', face: '🙂', color: '#7fd6ff', time: 18, every: 11, speed: 0.75 },
      { mode: 'MEDIUM', face: '😤', color: '#ffb020', time: 16, every: 9, speed: 1 },
      { mode: 'FAST', face: '😠', color: '#ff6a2a', time: 14, every: 7, speed: 1.25 },
      { mode: 'VERY FAST', face: '😡', color: '#ff2a2a', time: 12, every: 6, speed: 1.5 },
    ],
  },
  crushSeconds: 1.7, // flattened on the lane this long, then back to the start pad
  popupEvery: 1, // s between "+216" speed popups while training
}

// --- New-player intro cutscene (game/intro.js) -------------------------------------------
// Plays once per account before the first game: the player's own rider climbs the hill, a boulder
// comes down, it flattens them, and the camera lands behind them at the spawn. Skip button + Enter.
// Whether it was seen is saved on the game server (`introSeen` in the save); guests have no
// server save, so for them (and when the server never answers) a browser flag stands in.
// Captions: `shot` is one of crane | front | chase | boulder | face | crush | hub; from/to are
// seconds into that shot; kind 'title' (big gold) | 'alert' (big red) | default (white line).
export const INTRO = {
  storageKey: 'ihc.introSeen', // the guest / offline stand-in for the saved `introSeen`
  veteranPlayed: 60, // s: a save with more play time than this skips it (accounts from before the intro)
  waitForSave: 6, // s the loading screen waits for the save before falling back to the browser flag
  boulder: { kind: 'magma', mode: 'VERY FAST', s: 332, speed: 26 }, // the boulder in the chase
  captions: [
    { shot: 'crane', from: 0.5, to: 3.1, text: 'Impossible Hill Climb', kind: 'title' },
    { shot: 'front', from: 0.3, to: 3.1, text: 'Ride your bike up the hill' },
    { shot: 'chase', from: 0.3, to: 2.9, text: 'Every cave you reach pays Wins' },
    { shot: 'boulder', from: 0.5, to: 2.4, text: 'BOULDER!', kind: 'alert' },
    { shot: 'face', from: 0.5, to: 2.5, text: 'Too slow? Hide in a cave!' },
    { shot: 'hub', from: 0.7, to: 2.9, text: 'Train your Speed to climb higher' },
    { shot: 'hub', from: 3.0, to: 5.0, text: 'Reach the summit!', kind: 'title' },
  ],
}

// --- Audio (src/audio/) ---------------------------------------------------------------
// Everything is synthesised at runtime (no sound files). volume = default master level;
// M mutes (saved under storageKey).
export const AUDIO = {
  volume: 0.8,
  storageKey: 'ihc.sound',
  buses: { ui: 0.8, sfx: 0.9, amb: 0.5, engine: 0.55, boulder: 0.85 }, // per-bus levels before the master
  duck: 0.45, // world (ambience + engine + boulders) level while a panel / the hatch is open
  maxVoices: 48, // one-shot sounds at once before low-priority ones are skipped
  maxVoicesTouch: 24,
  // Output buffer (s, the AudioContext latencyHint) and how far ahead one-shots are scheduled.
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.02,
  // Generated impulse response (a canyon between cliffs): pre-delay s, early reflections [ms, gain],
  // tail decay s (to -60 dB), tail level, how fast the tail darkens, default send level.
  reverb: { seconds: 2.2, preDelay: 0.015, early: [[23, 0.45], [41, 0.32], [67, 0.25], [101, 0.16], [149, 0.1]], decay: 1.7, tail: 0.2, darken: 1.4, send: 0.85 },
  // The player's motorcycle (audio/engine.js), a 270-degree parallel twin: rpm at idle / redline,
  // gear top speeds (m/s, a little gearbox so it shifts while climbing), the throttle cut on an
  // upshift (s), treadmill pseudo-speed (m/s), layer levels, idleLevel = mix level standing still,
  // settle = level once the speed is steady (eased to over settleTime s), strain = extra drive on
  // steep uphill, crackle = deceleration pops; clunk / chirp / squeal levels and the airborne rev flare.
  engine: {
    idle: 1350,
    max: 10500,
    gears: [5, 10, 17, 26, 38, 55],
    shiftCut: 0.09,
    treadmillSpeed: 24,
    motor: 0.5,
    intake: 0.1,
    chain: 0.018,
    tires: 0.09,
    wind: 0.07,
    belt: 0.07,
    crackle: 0.2,
    idleLevel: 0.5,
    settle: 0.72,
    settleTime: 5,
    strain: 1.6,
    clunk: 0.12, // gear-change clunk
    chirp: 0.16, // launch tyre chirp
    squeal: 0.11, // tyre squeal at full slip
    airRev: 0.14, // rev flare (fraction of the rpm span) with the rear wheel in the air
  },
  // Boulders (audio/boulders.js): distance (m) at which a boulder is at half level, boulder radius
  // (m, sets the once-per-turn thump rate), layer levels, bounce thud level, and the camera shake
  // suggestion (cameraShakeFor): 1 at <= shakeNear m, 0 at >= shakeFar m.
  boulder: { near: 26, radius: 18, rumble: 0.9, sub: 0.55, crunch: 0.16, bounce: 0.4, shakeNear: 14, shakeFar: 70 },
  // Ambience (audio/ambience.js): scheduler tick s, lobby breeze, wind at the top (windTop m),
  // the high whistle up there, bird call level, gap range s, birds only below birdMaxAlt m.
  ambience: { tick: 0.25, breeze: 0.06, wind: 0.34, windTop: 200, whistle: 0.045, bird: 0.04, birdEvery: [3, 9], birdMaxAlt: 12 },
  // Background music (audio/music.js), composed live: bus level, level while a panel is open,
  // tempo, swing (fraction of an eighth the off-beats lag), the soft top-end ceiling (Hz), reverb
  // send, energy in the lobby / at the foot of the hill (0..1, layers join at 0.2 hand drums,
  // 0.5 kick, 0.55 harp, 0.62 brush snare, 0.82 shaker), altitude (m) of full energy, schedule
  // lookahead s, wait + fade-in s after the first tap, melody echo (beats, feedback, mix, tone Hz),
  // per-layer levels, B-key on/off storage key.
  music: {
    level: 0.42,
    duck: 0.7,
    bpm: 88,
    swing: 0.12,
    lowpass: 3200,
    verb: 0.32,
    lobbyEnergy: 0.32,
    climbEnergy: 0.5,
    climbTop: 140,
    lookahead: 0.3,
    startDelay: 0.8,
    fadeIn: 4,
    echo: { beats: 0.75, feedback: 0.3, mix: 0.24, tone: 1700 },
    layers: { pad: 0.3, bass: 0.26, keys: 0.34, pluck: 0.12, kick: 0.42, hand: 0.22, brush: 0.08, shaker: 0.035 },
    storageKey: 'ihc.music',
  },
}
