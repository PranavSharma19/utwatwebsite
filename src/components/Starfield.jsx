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
 * A scrim sits over the art so it reads as atmosphere rather than as a subject
 * competing with the title and the faction panels. There were two dust layers
 * of CSS point-stars on top as well; they were redundant noise, since the
 * artwork already has stars in it.
 *
 * Parallax is skipped entirely under prefers-reduced-motion; the artwork
 * itself stays, so nothing is lost but the movement.
 */
const ART_DEPTH = 0.03

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
        data-depth={ART_DEPTH}
        className="absolute -inset-y-24 inset-x-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${constellation})`, willChange: 'transform' }}
      />
      {/*
        A scrim over the art. The constellation is atmosphere, not a subject —
        without this it competes with the title and the faction panels for the
        same attention, and the hero reads as clutter. Darkening the middle
        lets the artwork breathe at the edges while content sits on calm
        ground.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 65% at 50% 40%, rgba(10,12,20,.97) 0%, rgba(10,12,20,.90) 40%, rgba(10,12,20,.55) 75%, rgba(10,12,20,.20) 100%)',
        }}
      />
    </div>
  )
}
