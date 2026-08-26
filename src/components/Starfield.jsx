import { useEffect, useRef } from 'react'
import constellation from '../assets/constellation.jpg'

/**
 * The page ground.
 *
 * The gold-and-blue constellation art is the site's identity — it is what
 * every section floats over and the reason the page reads as designed. It was
 * briefly replaced with CSS point-stars on the grounds that the original was a
 * 3.68 MB PNG. That was the wrong call: the file needed optimising, not
 * deleting. Re-encoded at 2400px it is 221 KB, six percent of the original,
 * with no visible banding in the dark gradients.
 *
 * Two dust layers sit on top at low opacity to give the art some depth as you
 * scroll. Parallax is skipped entirely under prefers-reduced-motion; the
 * artwork itself stays, so nothing is lost but the movement.
 */
const LAYERS = [
  { id: 'art', depth: 0.03 },
  { id: 'a', depth: 0.06 },
  { id: 'b', depth: 0.1 },
]

export default function Starfield() {
  const ref = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduce.matches) return

    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const node = ref.current
        if (!node) return
        for (const el of node.querySelectorAll('[data-layer]')) {
          const depth = Number(el.dataset.depth)
          el.style.transform = `translate3d(0, ${-y * depth}px, 0)`
        }
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-void" />
      <div
        data-layer="art"
        data-depth={LAYERS[0].depth}
        className="absolute -inset-y-24 inset-x-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${constellation})`, willChange: 'transform' }}
      />
      {LAYERS.slice(1).map((layer) => (
        <div
          key={layer.id}
          data-layer={layer.id}
          data-depth={layer.depth}
          className={`absolute inset-0 starfield-layer starfield-${layer.id}`}
          style={{ opacity: layer.id === 'a' ? 0.4 : 0.22, willChange: 'transform' }}
        />
      ))}
    </div>
  )
}
