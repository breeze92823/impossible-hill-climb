// Game audio, the one import the rest of the game uses:
//   import { installAudioHooks, sfx, setEngine, setBoulders, setAltitude } from './audio/index.js'
// installAudioHooks() once at boot after createHud() (audio itself starts on the first
// gesture), then every frame:
//   setEngine({ speed /*m/s*/, throttle /*0..1*/, uphill /*0..1*/, onTreadmill /*bool*/ })
//   setBoulders([{ distance /*m*/, speed /*m/s*/, pan /*-1..1*/ }, ...])   // 0..3 boulders
//   setAltitude(meters)                                                    // 0 in the lobby (wind + music energy)
// and sfx.<name>() for one-shots (see sfx.js). Nothing here ever throws, and every call
// is a no-op until the AudioContext is running (blocked audio = silence, not errors).
import { isMuted, setMuted, setSuspended, setVolume, toggleMuted } from './core.js'
import { sfx } from './sfx.js'
import * as engine from './engine.js'
import * as boulders from './boulders.js'
import * as ambience from './ambience.js'
import * as music from './music.js'

export { installAudioHooks, musicToggle } from './hooks.js'
export { sfx, setVolume, setMuted, setSuspended, isMuted, toggleMuted }
export { isMusicOn, setMusicOn, toggleMusic } from './music.js'
// onEngine((type, k) => ...): the player's engine 'pop' / 'shift' / 'launch' moments, so the
// exhaust flames land on the same beat as the sound.
export const onEngine = (fn) => engine.onEngine(fn)

export function setEngine(st) {
  try {
    if (st) engine.update(st)
  } catch (e) {
    warnOnce('engine', e)
  }
}
export function setBoulders(list) {
  try {
    boulders.update(list)
  } catch (e) {
    warnOnce('boulders', e)
  }
}
export function setAltitude(meters) {
  try {
    ambience.setAltitude(meters)
  } catch (e) {
    warnOnce('ambience', e)
  }
  try {
    music.setAltitude(meters) // the music builds up as the player climbs
  } catch (e) {
    warnOnce('music', e)
  }
}
// 0..1 camera shake suggestion for a boulder `distance` m from the player.
export function cameraShakeFor(distance) {
  try {
    return boulders.cameraShakeFor(distance)
  } catch {
    return 0
  }
}

const warned = new Set()
function warnOnce(what, e) {
  if (warned.has(what)) return
  warned.add(what)
  console.warn('[audio]', what, e)
}
