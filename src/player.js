import { inputState } from './input.js'
import { getYaw, syncYawToPlayer } from './camera.js'
import { isFirstPerson } from './modes.js'
import { RAPIER, alpha, onTick, world } from './physics.js'
import { PHYSICS, PLAYER_DIMS, SPAWN, SPAWN_FACING, TOUCH } from './config.js'

// The local player singleton, mutated in place. A kinematic Rapier capsule
// driven by Rapier's KinematicCharacterController: it slides along walls,
// autosteps small ledges, climbs slopes up to PHYSICS.maxSlope, snaps down
// steps and shoves dynamic bodies (crates, balls) with PHYSICS.pushMass.
// Gravity, jumping (with coyote time and a jump buffer) and acceleration are
// ours; collision resolution is Rapier's. Stepped once per physics tick.
export const player = {
  position: { x: 0, y: 0, z: 0 }, // capsule base (feet), at the latest tick
  renderPosition: { x: 0, y: 0, z: 0 }, // feet, interpolated for this frame
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  facing: SPAWN_FACING, // yaw the character model faces, radians
  dims: { ...PLAYER_DIMS },
  moveRule: null, // (wishX, wishZ, sprint) -> { speed, driftX, driftZ } | null, set by the lane
  frozen: false, // squashed by a boulder: no control
  pinned: false, // held in place (a fail animation draws the rider elsewhere): no movement at all
  launch: 0, // > 0: take off with this upward speed on the next tick (the jungle ramps)
  killY: PHYSICS.killY, // sank below this: respawn (each world sets its own)
  spawn: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, facing: SPAWN_FACING }, // where respawn() puts you (the world's hub)
}

const HALF = PLAYER_DIMS.height / 2 // capsule centre above the feet
const prev = { x: 0, y: 0, z: 0 }
let body = null
let collider = null
let controller = null
let sinceGrounded = 0
let jumpQueued = 0 // s left on a buffered jump
let steerEased = 0 // touch steer, eased toward inputState.drive.steer

export function createPlayerBody() {
  const r = PLAYER_DIMS.radius
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y + HALF, SPAWN.z))
  collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - r, r).setFriction(0), body)

  controller = world.createCharacterController(0.02)
  controller.setUp({ x: 0, y: 1, z: 0 })
  controller.enableAutostep(PHYSICS.stepHeight, 0.15, false)
  controller.enableSnapToGround(PHYSICS.snapToGround)
  controller.setMaxSlopeClimbAngle((PHYSICS.maxSlope * Math.PI) / 180)
  controller.setMinSlopeSlideAngle(((PHYSICS.maxSlope + 5) * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.setCharacterMass(PHYSICS.pushMass)

  resetPlayer()
  onTick(step)
}

export function resetPlayer(spawn = SPAWN, facing = SPAWN_FACING) {
  player.position.x = prev.x = player.renderPosition.x = spawn.x
  player.position.y = prev.y = player.renderPosition.y = spawn.y
  player.position.z = prev.z = player.renderPosition.z = spawn.z
  player.velocity.x = player.velocity.y = player.velocity.z = 0
  player.grounded = true
  player.facing = facing
  body?.setTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z }, true)
  body?.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z })
}

export function respawn() {
  resetPlayer(player.spawn, player.spawn.facing)
  syncYawToPlayer()
}

const TAU = Math.PI * 2
// Turns angle `from` toward `to` by at most maxDelta, the short way round.
function rotateTowards(from, to, maxDelta) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  if (Math.abs(diff) <= maxDelta) return to
  return (from + Math.sign(diff) * maxDelta) % TAU
}

// Moves the (x, z) velocity toward the target as one 2D vector so it curves
// straight instead of warping axis-by-axis.
function approach2D(v, targetX, targetZ, maxDelta) {
  const dx = targetX - v.x
  const dz = targetZ - v.z
  const dist = Math.hypot(dx, dz)
  if (dist <= maxDelta || dist === 0) {
    v.x = targetX
    v.z = targetZ
  } else {
    v.x += (dx / dist) * maxDelta
    v.z += (dz / dist) * maxDelta
  }
}

function step(dt) {
  prev.x = player.position.x
  prev.y = player.position.y
  prev.z = player.position.z
  if (player.pinned) {
    player.velocity.x = player.velocity.y = player.velocity.z = 0
    return
  }

  // Camera-relative ground basis.
  const yaw = getYaw()
  const fwdX = -Math.sin(yaw)
  const fwdZ = -Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const mv = inputState.move
  const len = Math.hypot(mv.x, mv.z)
  const scale = len > 1 ? 1 / len : 1
  let wishX = (fwdX * mv.z + rightX * mv.x) * scale
  let wishZ = (fwdZ * mv.z + rightZ * mv.x) * scale

  // Touch bike controls: steering turns the bike, GAS / BRAKE push along its own heading
  // (keys win on a hybrid device, so a held WASD still drives camera-relative).
  const drive = inputState.drive
  const driving = drive.active && len < 0.01 && !player.frozen
  if (driving) {
    steerEased += (drive.steer - steerEased) * (1 - Math.exp(-TOUCH.steerEase * dt))
    const rolling = Math.min(1, Math.hypot(player.velocity.x, player.velocity.z) / 4)
    if (isFirstPerson()) player.facing = yaw + Math.PI // a look drag turns the bike too
    const turn = steerEased * TOUCH.steerRate * (TOUCH.steerStill + (1 - TOUCH.steerStill) * rolling) * dt
    player.facing = Math.atan2(Math.sin(player.facing - turn), Math.cos(player.facing - turn))
    const k = drive.throttle > 0 ? drive.throttle : drive.throttle * TOUCH.reverse
    wishX = Math.sin(player.facing) * k
    wishZ = Math.cos(player.facing) * k
  } else steerEased = 0
  let speed = inputState.sprint ? PHYSICS.sprintSpeed : PHYSICS.walkSpeed
  // A zone can take over movement (the hill lane: speed from the stat, slope drag, slipping).
  let driftX = 0
  let driftZ = 0
  if (player.frozen) speed = 0
  else if (player.moveRule) {
    const r = player.moveRule(wishX, wishZ, inputState.sprint)
    if (r) {
      speed = r.speed
      driftX = r.driftX || 0
      driftZ = r.driftZ || 0
    }
  }

  const rate = !player.grounded ? PHYSICS.airAccel : Math.hypot(wishX, wishZ) > 0.01 ? PHYSICS.accel : PHYSICS.decel
  approach2D(player.velocity, wishX * speed + driftX, wishZ * speed + driftZ, rate * dt)

  // Jump: buffered a little before landing, and allowed a little after leaving a ledge.
  if (inputState.jump) {
    jumpQueued = PHYSICS.jumpBuffer
    inputState.jump = false
  }
  sinceGrounded = player.grounded ? 0 : sinceGrounded + dt
  let jumped = false
  if (player.launch > 0) {
    player.velocity.y = player.launch
    player.launch = 0
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
  } else if (jumpQueued > 0 && sinceGrounded <= PHYSICS.coyoteTime) {
    player.velocity.y = PHYSICS.jumpSpeed
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
  }
  jumpQueued = Math.max(0, jumpQueued - dt)

  player.velocity.y += PHYSICS.gravity * dt
  if (player.grounded && !jumped && player.velocity.y < -2) player.velocity.y = -2 // stay pressed to slopes

  const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt }
  controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
  const moved = controller.computedMovement()
  player.grounded = !jumped && controller.computedGrounded()

  // Blocked vertically: a ceiling stops the rise, the floor stops the fall.
  if (player.velocity.y > 0 && moved.y < desired.y * 0.5) player.velocity.y = 0
  if (player.grounded && player.velocity.y < 0) player.velocity.y = Math.max(player.velocity.y, -2)
  // Horizontal velocity is left alone: the controller already slides along walls,
  // and scaling it by moved/desired would also bleed speed on every ramp and step.

  const t = body.translation()
  const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z }
  body.setNextKinematicTranslation(next)
  player.position.x = next.x
  player.position.y = next.y - HALF
  player.position.z = next.z

  if (player.position.y < player.killY) {
    respawn()
    return
  }

  // The body turns toward its heading; in first person it always faces the view (the touch
  // bike already set its heading above: there the view follows the bike instead).
  if (driving) {
    if (isFirstPerson()) syncYawToPlayer()
  } else if (isFirstPerson()) player.facing = yaw + Math.PI
  else if (Math.hypot(wishX, wishZ) > 0.05) {
    player.facing = rotateTowards(player.facing, Math.atan2(wishX, wishZ), PHYSICS.turnSpeed * dt)
  }
}

// Called once per frame after the physics ticks: interpolated feet position.
export function interpolate() {
  const p = player.position
  const r = player.renderPosition
  r.x = prev.x + (p.x - prev.x) * alpha
  r.y = prev.y + (p.y - prev.y) * alpha
  r.z = prev.z + (p.z - prev.z) * alpha
}
