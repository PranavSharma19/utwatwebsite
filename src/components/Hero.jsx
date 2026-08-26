import { useState } from 'react'
import Crawl from './Crawl'
import FactionChoice from '../faction/FactionChoice'
import handImg from '../assets/hand.png'

/**
 * The Hero: three beats over the globally-mounted Starfield.
 *
 * 1. Crawl — the approved copy, receding into the page.
 * 2 & 3. Title and faction choice, revealed together once the crawl
 *    resolves. There is deliberately only one state transition between
 *    "crawl" and "revealed": Crawl's onDone fires synchronously and
 *    without a skip control under prefers-reduced-motion, so anything
 *    gated behind a further timer or animation would strand that visitor.
 *    Setting state directly in the handler is what keeps this safe.
 *
 * No background here — Starfield is mounted once by LandingPage and shows
 * through everywhere this section doesn't paint its own surface.
 */
const CRAWL_COPY =
  'Two schools. Thirty-six hours. One arena. UTMIST and WAT.ai send their finest builders to settle it the only way that matters — in code.'

export default function Hero() {
  const [revealed, setRevealed] = useState(false)

  return (
    <section className="relative overflow-hidden px-gutter py-20 sm:py-28">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        {!revealed && (
          <Crawl text={CRAWL_COPY} onDone={() => setRevealed(true)} />
        )}

        {revealed && (
          <div className="flex w-full flex-col items-center">
            <span className="font-mono text-[10px] uppercase tracking-[.35em] text-muted">
              Toronto &amp; Waterloo &middot; Late Summer 2026
            </span>

            {/*
              The title carries a blue-to-gold gradient: it literally runs from
              UTMIST's colour to WAT.ai's, which is the whole premise of the
              event. This was briefly flattened to plain white with a single
              accent word — the gradient is the site's signature and the same
              treatment the navbar wordmark uses.
            */}
            {/*
              The hand, back at hero scale and behind the title rather than
              stacked after it. At 132px in a seam it read as a leftover; in
              the original it was a 700px element the title sat over. It is
              decorative and inert (alt="", pointer-events-none), and it is
              behind the copy so it can never intercept a click.
            */}
            <div className="relative w-full pb-24 sm:pb-32">
              <img
                src={handImg}
                alt=""
                className="pointer-events-none absolute left-1/2 top-2 z-0 w-[86%] max-w-[440px] -translate-x-1/2 select-none opacity-55 drop-shadow-[0_0_70px_rgba(139,167,218,0.45)] sm:top-0 sm:max-w-[520px]"
              />
              <h1 className="hero-title relative z-10 mt-6 bg-gradient-to-r from-signal via-ink to-waterloo bg-clip-text font-display text-5xl font-black uppercase leading-[1.05] tracking-tight text-transparent sm:text-7xl">
              Battle of the
              <br />
                Schools
              </h1>
            </div>

            <p className="relative z-20 mt-6 max-w-xl font-sans text-base leading-relaxed text-muted sm:text-lg">
              Pick a side. It gets settled in September.
            </p>

            <div className="relative z-10 mt-10 w-full">
              <FactionChoice />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
