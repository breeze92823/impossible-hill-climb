// Everyone else in the room, drawn in the world exactly like the local rider: the Bloxity base rig
// in THEIR look (equipped items, proportions, skin) seated on their equipped bike with their
// trail and pets, riding with the same animator, wheel spin, lean and exhaust, and their name
// floating over them. Read straight from the roster net.js keeps (backend PlayerState): position,
// heading and speed are eased toward the last pose (sent every NET.poseEvery s); look, bike, trail
// and pets are replicated as ids / the look JSON, never URLs. Nothing here collides; with no server
// (or disconnected) the set is empty.
import * as THREE from 'three'
import { ALL_BIKES, BIKES, TRAILS } from '../config.js'
import { net } from '../net.js'
import { createRider } from './rider.js'
import { createPetPack } from './petpack.js'
import { buildDefaultCharacter, loadBaseCharacter } from '../avatar/character.js'
import { applyProportions, attachEquippedAccessories } from '../avatar/loader.js'
import { label } from '../propkit.js'
import { attachBubble } from '../bloxity.js'

const MAX_REMOTES = 24 // riders drawn at once; the room cap is 50
const FOLLOW = 10 // 1/s: how fast a remote eases toward its last pose
const SNAP = 30 // m: a jump further than this (respawn, teleport) is not eased
const FAR = 220 // m from the camera: further riders are hidden and not animated
const LABEL_Y = 3.1 // m over the rider's feet
const LABEL_H = 0.5

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const ease = (k, dt) => 1 - Math.exp(-k * dt)

function parseLook(json) {
  try {
    const look = json ? JSON.parse(json) : null
    return look && typeof look === 'object' && look.equipped && typeof look.equipped === 'object' ? look : null
  } catch {
    return null
  }
}
const bikeOf = (id) => ALL_BIKES.find((b) => b.id === id) ?? BIKES[0]
const trailColor = (id) => TRAILS.find((t) => t.id === id)?.color ?? null

// scene: where riders go; pools: the particle pools (exhaust); camera: for the distance cull.
export function createRemotePlayers({ scene, pools, camera }) {
  const remotes = new Map() // sessionId -> remote

  function add(id, p) {
    const rider = createRider(scene, { pools, trail: true })
    const pack = createPetPack(scene)
    const r = {
      id,
      rider,
      pack,
      state: p,
      look: null,
      gen: 0,
      name: null,
      label: null,
      bike: null,
      trail: null,
      pets: null,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      speed: 0,
      uid: p.uid,
    }
    rider.setAvatar(buildDefaultCharacter()) // visible at once; swapped when their look lands
    pack.rebuild({ x: p.x, y: p.y, z: p.z }, [])
    remotes.set(id, r)
    return r
  }

  function remove(r) {
    r.gen++ // drop a look still loading
    r.rider.dispose()
    r.pack.dispose()
    if (r.label) {
      r.label.material.map?.dispose()
      r.label.material.dispose()
    }
    remotes.delete(r.id)
  }

  function setName(r, name) {
    r.name = name
    if (r.label) {
      r.rider.group.remove(r.label)
      r.label.material.map?.dispose()
      r.label.material.dispose()
    }
    r.label = label(name, LABEL_H, { color: '#ffffff', outline: '#000000' })
    r.label.position.y = LABEL_Y
    r.rider.group.add(r.label)
  }

  // The player's look: the shared base rig dressed in their equipped Bloxity items + proportions
  // + skin ('' = the default character), the same pipeline as the local avatar.
  async function loadLook(r, json) {
    const mine = ++r.gen
    const look = parseLook(json)
    const avatar = await loadBaseCharacter()
    if (mine !== r.gen) return
    if (look) {
      await attachEquippedAccessories(avatar, look.equipped, { skinTextureUrl: typeof look.skin === 'string' ? look.skin : null })
      if (mine !== r.gen) return
      applyProportions(avatar, look.proportions ?? null)
    }
    r.rider.setAvatar(avatar)
  }

  function sync() {
    const players = net.connected ? net.players : null
    for (const r of [...remotes.values()]) if (!players?.has(r.id) || r.id === net.sessionId) remove(r)
    players?.forEach((p, id) => {
      if (id === net.sessionId) return
      let r = remotes.get(id)
      if (!r) {
        if (remotes.size >= MAX_REMOTES) return
        r = add(id, p)
      }
      r.state = p
      r.uid = p.uid
      const name = p.username || 'Player'
      if (name !== r.name) setName(r, name)
      if (p.avatar !== r.look) {
        r.look = p.avatar
        loadLook(r, p.avatar).catch((err) => console.warn('[remotePlayers] look failed', err))
      }
      if (p.bike !== r.bike) {
        r.bike = p.bike
        r.rider.setBike(bikeOf(p.bike))
      }
      if (p.trail !== r.trail) {
        r.trail = p.trail
        r.rider.setTrail(trailColor(p.trail))
      }
      if (p.pets !== r.pets) {
        r.pets = p.pets
        r.pack.rebuild({ x: r.x, y: r.y, z: r.z }, p.pets ? p.pets.split(',') : [])
      }
    })
  }

  function update(dt, t) {
    sync()
    for (const r of remotes.values()) {
      const p = r.state
      const k = ease(FOLLOW, dt)
      const px = r.x
      const pz = r.z
      if (Math.hypot(p.x - r.x, p.z - r.z) > SNAP) {
        r.x = p.x
        r.y = p.y
        r.z = p.z
      } else {
        r.x += (p.x - r.x) * k
        r.y += (p.y - r.y) * k
        r.z += (p.z - r.z) * k
      }
      r.yaw += wrap(p.yaw - r.yaw) * k
      const moved = Math.hypot(r.x - px, r.z - pz)
      // Pace from the eased motion (it drives the legs and wheel spin like the local rider's speed).
      r.speed += (Math.min(moved / Math.max(dt, 1e-3), 60) - r.speed) * ease(6, dt)

      const near = Math.hypot(camera.position.x - r.x, camera.position.z - r.z) < FAR
      r.rider.setVisible(near)
      r.pack.root.visible = near
      if (!near) continue
      r.rider.update(dt, t, { x: r.x, y: r.y, z: r.z, facing: r.yaw, speed: r.speed, distance: moved, grounded: true, vy: 0 })
      r.pack.update(dt, t, { x: r.x, y: r.y, z: r.z, facing: r.yaw })
    }
  }

  return {
    update,
    // A chat message from Boxity: draw the 4 s bubble over the sender if they are in view's roster.
    bubble(message) {
      for (const r of remotes.values()) if (r.uid && r.uid === message.userId) return attachBubble(THREE, r.rider.group, message)
    },
    get count() {
      return remotes.size
    },
  }
}
