import { useEffect, useRef, useState } from 'react'

// Matches the resting opacity .cursor-glow used to declare in src/index.css.
const REVEALED_OPACITY = '0.1'

/**
 * A soft glow in the current faction accent that follows the pointer.
 *
 * Purely decorative, and deliberately additive: the native cursor is never
 * hidden, the element never receives pointer events, and it renders nothing
 * at all on touch devices or under prefers-reduced-motion. Removing it costs
 * the site no function.
 */
export default function CursorGlow() {
  const ref = useRef(null)

  // Lazy initialiser, not setState inside an effect: this repo's
  // eslint-plugin-react-hooks 7.x sets react-hooks/set-state-in-effect to error.
  const [enabled] = useState(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    return !reduce && !coarse
  })

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let x = 0
    let y = 0

    const onMove = (event) => {
      x = event.clientX
      y = event.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const node = ref.current
        if (!node) return
        node.style.transform = `translate3d(${x}px, ${y}px, 0)`
        // The element is fixed at the viewport origin until the first move,
        // so .cursor-glow ships at opacity 0 and is revealed here — otherwise
        // a 260px accent blob sits in the top-left corner of every page load.
        node.style.opacity = REVEALED_OPACITY
      })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])

  if (!enabled) return null

  return <div ref={ref} data-cursor-glow aria-hidden="true" className="cursor-glow pointer-events-none" />
}
