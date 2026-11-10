import { Group } from 'three'
import { MAX_EQUIPPED_PETS, PETS } from '../config.js'
import { animatePet, buildPet } from '../lobby/pets.js'
import { state } from './state.js'

// The equipped pets trotting behind the player in a little V formation.
const SLOTS = [
  { side: -1.7, back: 2.4 },
  { side: 1.7, back: 2.4 },
  { side: 0, back: 3.8 },
]

export function createPetPack(scene) {
  const root = new Group()
  scene.add(root)
  let pets = [] // { model, x, z, yaw, phase }

  // petIds: PETS keys to show (another player's equipped pets); omitted = this player's own.
  function rebuild(anchor, petIds) {
    for (const p of pets) root.remove(p.model)
    const list = petIds ?? state.equippedPets.map((uid) => state.pets.find((p) => p.uid === uid)).filter(Boolean).map((p) => p.id)
    pets = list
      .filter((id) => PETS[id])
      .slice(0, MAX_EQUIPPED_PETS)
      .map((id, i) => {
        const model = buildPet(PETS[id])
        root.add(model)
        return { model, x: anchor?.x ?? 0, z: anchor?.z ?? 0, y: anchor?.y ?? 0, yaw: 0, phase: i * 1.3 }
      })
  }

  return {
    root,
    rebuild,
    dispose() {
      scene.remove(root)
    },
    // anchor: player feet { x, y, z, facing }
    update(dt, t, anchor) {
      if (!pets.length) return
      const s = Math.sin(anchor.facing)
      const c = Math.cos(anchor.facing)
      pets.forEach((p, i) => {
        const slot = SLOTS[i % SLOTS.length]
        // facing +Z is forward; right = (-cos, sin)... local (side, back) -> world
        const tx = anchor.x - s * slot.back - c * slot.side
        const tz = anchor.z - c * slot.back + s * slot.side
        const dx = tx - p.x
        const dz = tz - p.z
        const dist = Math.hypot(dx, dz)
        const k = Math.min(1, dt * (dist > 8 ? 10 : 5))
        p.x += dx * k
        p.z += dz * k
        p.y += (anchor.y - p.y) * Math.min(1, dt * 10)
        const moving = dist > 0.35
        const want = moving ? Math.atan2(dx, dz) : anchor.facing
        const diff = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw))
        p.yaw += diff * Math.min(1, dt * 8)
        const hop = moving ? Math.abs(Math.sin(t * 9 + p.phase)) * 0.18 : 0
        p.model.position.set(p.x, p.y + hop, p.z)
        p.model.rotation.y = p.yaw
        animatePet(p.model, t + p.phase, moving)
      })
    },
  }
}
