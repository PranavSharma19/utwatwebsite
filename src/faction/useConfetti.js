import { useCallback, useEffect, useRef } from 'react'

/**
 * A one-shot confetti burst, drawn on a canvas we own.
 *
 * Hand-rolled rather than pulled from a package: the whole thing is a bit of
 * ballistics and a fade, and doing it here means the colours come from the
 * faction that was actually picked and the reduced-motion behaviour matches
 * the rest of the site instead of whatever a library decided.
 *
 * Under prefers-reduced-motion `fire()` is a no-op — no canvas work, no frame
 * loop, nothing scheduled. Picking a side still works exactly the same.
 */
const PARTICLES = 90
const GRAVITY = 0.32
const DRAG = 0.988
const FADE_AFTER = 0.55 // fraction of life before it starts fading
const LIFE_MS = 1900

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function useConfetti() {
  const canvasRef = useRef(null)
  const frameRef = useRef(0)
  const particlesRef = useRef([])

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    particlesRef.current = []
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  useEffect(() => stop, [stop])

  /**
   * @param {{x:number,y:number}} origin  viewport coordinates to burst from
   * @param {string[]} colors             drawn from evenly at random
   */
  const fire = useCallback(
    (origin, colors) => {
      if (prefersReducedMotion()) return
      const canvas = canvasRef.current
      if (!canvas) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      particlesRef.current = Array.from({ length: PARTICLES }, () => {
        // Bias upward and outward — a burst, not a fountain.
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1
        const speed = 7 + Math.random() * 11
        return {
          x: origin.x + (Math.random() - 0.5) * 40,
          y: origin.y + (Math.random() - 0.5) * 16,
          vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 0.34,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          color: colors[(Math.random() * colors.length) | 0],
          born: performance.now(),
        }
      })

      if (frameRef.current) cancelAnimationFrame(frameRef.current)

      const tick = () => {
        const now = performance.now()
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        let alive = 0

        for (const p of particlesRef.current) {
          const age = (now - p.born) / LIFE_MS
          if (age >= 1) continue
          alive++

          p.vy += GRAVITY
          p.vx *= DRAG
          p.vy *= DRAG
          p.x += p.vx
          p.y += p.vy
          p.rot += p.vrot

          ctx.save()
          ctx.globalAlpha =
            age < FADE_AFTER ? 1 : 1 - (age - FADE_AFTER) / (1 - FADE_AFTER)
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillStyle = p.color
          // Squash on rotation so each piece reads as a flat flake tumbling
          // rather than a solid block.
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)))
          ctx.restore()
        }

        if (alive > 0) {
          frameRef.current = requestAnimationFrame(tick)
        } else {
          stop()
        }
      }

      frameRef.current = requestAnimationFrame(tick)
    },
    [stop],
  )

  return { canvasRef, fire }
}
