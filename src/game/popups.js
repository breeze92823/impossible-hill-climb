import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { fmt } from './state.js'

// Floating feedback: "+216 👟" speed popups that rise off the rider while
// training (world-space sprites), and the big "+2 WINS" splash when a win pad
// is claimed (DOM, slams in over the HUD).

function drawShoe(g, x, y, s) {
  // a chunky blue sneaker, drawn in canvas units of size s
  g.save()
  g.translate(x, y)
  g.rotate(-0.25)
  g.lineJoin = 'round'
  g.lineWidth = s * 0.09
  g.strokeStyle = '#13213f'
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.roundRect(-s * 0.55, s * 0.12, s * 1.15, s * 0.24, s * 0.1)
  g.fill()
  g.stroke()
  const grad = g.createLinearGradient(0, -s * 0.4, 0, s * 0.2)
  grad.addColorStop(0, '#6fd3ff')
  grad.addColorStop(1, '#1f7bff')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(-s * 0.5, s * 0.14)
  g.quadraticCurveTo(-s * 0.55, -s * 0.38, -s * 0.12, -s * 0.42)
  g.quadraticCurveTo(s * 0.05, -s * 0.12, s * 0.35, -s * 0.05)
  g.quadraticCurveTo(s * 0.62, 0, s * 0.6, s * 0.14)
  g.closePath()
  g.fill()
  g.stroke()
  g.strokeStyle = '#ffffff'
  g.lineWidth = s * 0.06
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.moveTo(-s * 0.18 + i * s * 0.14, -s * 0.28 + i * s * 0.05)
    g.lineTo(-s * 0.02 + i * s * 0.14, -s * 0.2 + i * s * 0.05)
    g.stroke()
  }
  g.restore()
}

function speedCanvas(text) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const g = c.getContext('2d')
  g.font = '700 110px Fredoka, "Arial Black", sans-serif'
  g.textAlign = 'right'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = 20
  g.strokeStyle = '#13213f'
  g.strokeText(text, 330, 86)
  g.fillStyle = '#ffffff'
  g.fillText(text, 330, 86)
  drawShoe(g, 420, 80, 130)
  return c
}

export function createPopups(scene) {
  const live = []
  return {
    speed(amount, pos) {
      const tex = new CanvasTexture(speedCanvas(`+${fmt(amount)}`))
      tex.colorSpace = SRGBColorSpace
      const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }))
      s.renderOrder = 20
      s.position.set(pos.x + (Math.random() - 0.5) * 1.5, pos.y + 3.2, pos.z)
      scene.add(s)
      live.push({ s, t: 0, life: 1.4 })
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]
        p.t += dt
        const k = p.t / p.life
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.4)
        p.s.scale.set(3.4 * pop, 1.06 * pop, 1)
        p.s.position.y += dt * 1.6
        p.s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
        if (k >= 1) {
          scene.remove(p.s)
          p.s.material.map.dispose()
          p.s.material.dispose()
          live.splice(i, 1)
        }
      }
    },
  }
}

// --- Big win splash (DOM) ----------------------------------------------------------------
let style = null
export function winSplash(n, sub = 'Return') {
  if (!style) {
    style = document.createElement('style')
    style.textContent = `
.win-splash{position:fixed;left:50%;top:58%;z-index:30;pointer-events:none;transform:translate(-50%,-50%);font-family:Fredoka,'Arial Black',sans-serif;text-align:center;animation:winIn 1.9s cubic-bezier(.2,1.4,.4,1) forwards}
.win-splash b{display:block;font-weight:700;font-size:clamp(56px,13vmin,150px);line-height:.95;color:#ffd21f;background:linear-gradient(#fff36b,#ffb020 60%,#ff7a00);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 .06em 0 #3a1a00) drop-shadow(0 0 .02em #3a1a00);-webkit-text-stroke:.05em #3a1a00;paint-order:stroke fill}
.win-splash i{display:block;font-style:normal;font-weight:700;font-size:clamp(22px,4.5vmin,48px);color:#fff;-webkit-text-stroke:.12em #14112b;paint-order:stroke fill;margin-top:.1em}
.win-splash .trophy{font-size:.75em;vertical-align:.08em;-webkit-text-fill-color:initial;-webkit-text-stroke:0}
@keyframes winIn{0%{opacity:0;transform:translate(-50%,-50%) scale(.2) rotate(-8deg)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(3deg)}24%{transform:translate(-50%,-50%) scale(1) rotate(0)}78%{opacity:1;transform:translate(-50%,-62%) scale(1)}100%{opacity:0;transform:translate(-50%,-90%) scale(.9)}}
@media (prefers-reduced-motion:reduce){.win-splash{animation-duration:.01s;animation-delay:1.6s}}`
    document.head.appendChild(style)
  }
  const el = document.createElement('div')
  el.className = 'win-splash'
  el.innerHTML = `<b>+${fmt(n)} <span class="trophy">🏆</span>${n === 1 ? 'WIN' : 'WINS'}</b>${sub ? `<i>${sub}</i>` : ''}`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2000)
}
