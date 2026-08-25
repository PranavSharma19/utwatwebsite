/**
 * Whether the visitor has asked for reduced motion.
 *
 * src/index.css already neutralises CSS animations, transitions and
 * `scroll-behavior` under the same media query, but `window.scrollTo({
 * behavior: 'smooth' })` is a scripted scroll that `scroll-behavior` does
 * not govern — it has to be asked for explicitly. Callers use
 * `scrollBehavior()` so the two stay in step.
 */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** The `behavior` to hand to window.scrollTo / scrollIntoView. */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
