// The three worlds in one scene (WORLDS in config): World 1 = the lobby + hill lane (built in
// main.js), World 2 = jungle hub + Jungle Jumps, World 3 = volcano hub + Magma Run. They sit far
// apart on X, and only the one you are in is drawn (and runs its particles / hazards).
// Every world exposes the same course interface to main.js:
//   rule(px, pz, max, wishX, wishZ, sprint) -> { speed } | null    (player.moveRule)
//   trainAt(px, pz) -> Speed x  ·  nextGoal(max) -> { max, name } | null  ·  ground(px, pz) -> dust key
//   altitude(p) -> m (music / wind)  ·  start { x, y, z, facing } (where pads / deaths send you)
// and the new worlds also: update(dt, t, p, active) -> events, hazard(p), padAt(p), fail(kind, at, dir).
import { PHYSICS, SPAWN, SPAWN_FACING, WORLDS } from '../config.js'
import { player } from '../player.js'
import { buildWorldHub } from '../lobby/worldhub.js'
import { buildJungle } from '../lobby/jungle.js'
import { buildVolcano } from '../lobby/volcano.js'
import { gateEmitters } from '../lobby/worldkit.js'

let current = 'w1'
const entries = {}

export const currentWorld = () => current
// The HUD's "NEXT:" goal in the world you are in.
export const worldGoal = (max) => entries[current]?.course.nextGoal(max) ?? null

// w1: { roots, course } for World 1 (the course adapter wraps the hill lane).
export function createWorlds({ scene, pools, audio, lighting, w1 }) {
  const isActive = (id) => () => current === id
  entries.w1 = { id: 'w1', def: WORLDS[0], roots: w1.roots, course: w1.course, hub: null, spawn: { ...SPAWN, facing: SPAWN_FACING }, killY: PHYSICS.killY, sky: null }
  for (const def of WORLDS.slice(1)) {
    const active = isActive(def.id)
    const hub = gateEmitters(pools, active, () => buildWorldHub(scene, pools, def.id, active))
    const build = def.id === 'w2' ? buildJungle : buildVolcano
    const course = gateEmitters(pools, active, () => build(scene, pools, audio, def.origin))
    entries[def.id] = { id: def.id, def, roots: [hub.root, course.root], course, hub, spawn: hub.spawn, killY: -40, sky: def.sky }
    hub.root.visible = course.root.visible = false
  }

  function enter(id) {
    const e = entries[id]
    if (!e) return null
    current = id
    for (const other of Object.values(entries)) for (const r of other.roots) r.visible = other === e
    lighting.setMoods(e.sky)
    player.spawn = { ...e.spawn }
    player.killY = e.killY
    return e
  }

  return {
    get current() {
      return current
    },
    entry: (id = current) => entries[id],
    course: () => entries[current].course,
    enter,
    // Every hub's triggers (they test world positions, so the far-off ones never fire).
    triggers: Object.values(entries).flatMap((e) => e.hub?.triggers ?? []),
    update(dt, t) {
      for (const e of Object.values(entries)) e.hub?.update(dt, t)
    },
  }
}
