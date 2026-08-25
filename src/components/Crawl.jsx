import { useEffect, useRef, useState } from 'react'

/**
 * The opening crawl: text receding into the starfield on a CSS 3D transform.
 *
 * The wording and typeface are ours; only the perspective effect is borrowed,
 * and that is not protectable. No franchise names, marks, or typefaces appear
 * anywhere in this component.
 *
 * Under prefers-reduced-motion the text renders as a plain static block and
 * onDone fires immediately, so nobody is held behind an animation they asked
 * not to see. A skip control is always available.
 */
export default function Crawl({ text, onDone }) {
  const doneRef = useRef(false)

  // Lazy initialiser, not setState inside an effect: this repo's
  // eslint-plugin-react-hooks 7.x sets react-hooks/set-state-in-effect to error.
  const [animated] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone?.()
  }

  useEffect(() => {
    // Nothing to wait for when motion is reduced, so release the caller at once
    // rather than holding it behind an animation it opted out of.
    if (!animated) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!animated) {
    return (
      <div className="mx-auto max-w-2xl px-gutter text-center">
        <p className="font-sans text-base leading-relaxed text-muted">{text}</p>
      </div>
    )
  }

  return (
    <div className="crawl-stage" data-animated="true">
      <div className="crawl-track" onAnimationEnd={finish}>
        <p className="crawl-copy font-display uppercase">{text}</p>
      </div>
      <button
        type="button"
        onClick={finish}
        className="crawl-skip font-mono text-[10px] uppercase tracking-[.25em] text-muted hover:text-accent"
      >
        Skip intro
      </button>
    </div>
  )
}
