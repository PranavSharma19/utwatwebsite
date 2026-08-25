import { useEffect, useRef } from 'react'

/**
 * The void. Three depth layers of CSS point-stars over two institutional
 * nebulae — UofT blue bleeding from one corner, Waterloo gold from the
 * other, echoing the diagonal that was already in the old background.png.
 *
 * This replaces a 3.86 MB PNG with a few hundred bytes of gradients.
 * Parallax is skipped entirely under prefers-reduced-motion; the static
 * field remains, so nothing is lost but the movement.
 */
const LAYERS = [
  { depth: 0.02, id: 'a', opacity: 0.9 },
  { depth: 0.05, id: 'b', opacity: 0.6 },
  { depth: 0.09, id: 'c', opacity: 0.35 },
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
      <div className="absolute inset-0 starfield-nebula" />
      {LAYERS.map((layer) => (
        <div
          key={layer.id}
          data-layer={layer.id}
          data-depth={layer.depth}
          className={`absolute inset-0 starfield-layer starfield-${layer.id}`}
          style={{ opacity: layer.opacity, willChange: 'transform' }}
        />
      ))}
    </div>
  )
}
