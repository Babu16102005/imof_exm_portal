import { useEffect, useRef } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const clamp = (v, m) => Math.max(-m, Math.min(m, v))

/**
 * Tilt — gyroscopic 3D hover, ported from imofedu.com's `data-tilt`
 * (perspective 1000px, tilt-max 5 on service cards / stat images / reviews).
 *
 * - Desktop: pointer position drives rotateX/rotateY (lerped in rAF).
 * - Mobile: the actual gyroscope (`deviceorientation`) drives the same
 *   rotation once the user tilts the phone — no tap/hold needed.
 * - Transform-only: glass surfaces, blur, layout and grid are untouched.
 * - Children marked with `data-tilt-pop` float at translateZ(28px),
 *   mirroring the site's `.service-card-hh { translateZ(20px) }` depth.
 * - Renders as any tag via `as` so list/article semantics stay intact.
 */
export function Tilt({ as: Tag = 'div', max = 6, gyro = true, className = '', style, children, ...rest }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const s = { rx: 0, ry: 0, tx: 0, ty: 0, raf: 0, pointerActive: false, lastPointer: 0 }

    const render = () => {
      s.rx += (s.tx - s.rx) * 0.16
      s.ry += (s.ty - s.ry) * 0.16
      const settled = Math.abs(s.tx - s.rx) < 0.02 && Math.abs(s.ty - s.ry) < 0.02
      if (settled && s.tx === 0 && s.ty === 0) {
        el.style.transform = ''
        s.raf = 0
        return
      }
      el.style.transform = `perspective(900px) rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg)`
      s.raf = requestAnimationFrame(render)
    }
    const kick = () => {
      if (!s.raf) s.raf = requestAnimationFrame(render)
    }

    const onPointerMove = (e) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      s.pointerActive = true
      s.lastPointer = Date.now()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      s.ty = clamp(px * 2 * max, max)
      s.tx = clamp(-py * 2 * max, max)
      kick()
    }
    const onPointerLeave = () => {
      s.pointerActive = false
      s.tx = 0
      s.ty = 0
      kick()
    }
    // Real gyroscope: ignored while the pointer is in charge (desktop) and
    // for 4s after any touch, so the two inputs never fight.
    const onOrient = (e) => {
      if (!gyro || s.pointerActive || Date.now() - s.lastPointer < 4000) return
      if (e.beta == null || e.gamma == null) return
      s.tx = clamp((e.beta - 45) * 0.22, max)
      s.ty = clamp(e.gamma * 0.3, max)
      kick()
    }

    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('pointercancel', onPointerLeave)
    window.addEventListener('deviceorientation', onOrient)
    return () => {
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      el.removeEventListener('pointercancel', onPointerLeave)
      window.removeEventListener('deviceorientation', onOrient)
      cancelAnimationFrame(s.raf)
    }
  }, [max, gyro])

  return (
    <Tag ref={ref} className={`tilt ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  )
}

export default Tilt
