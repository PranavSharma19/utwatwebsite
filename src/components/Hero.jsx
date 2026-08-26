import { useEffect } from 'react'
import FactionChoice from '../faction/FactionChoice'
import { primeTally } from '../cheer/cheerClient'
import handImg from '../assets/hand.png'

/**
 * The Hero: title, hand, and the faction choice, over the globally-mounted
 * Starfield.
 *
 * This used to open with a 6.5s receding text crawl that gated everything
 * below it, so the page's two slowest items did not even begin loading until
 * the animation had finished. The crawl's copy was only ever on screen while
 * it played -- it unmounted the instant it resolved -- and the About section
 * directly below states the same thing permanently and more precisely, so
 * removing it cost the page no standing content.
 *
 * No background here — Starfield is mounted once by LandingPage and shows
 * through everywhere this section doesn't paint its own surface.
 */
export default function Hero() {

  /**
   * Kicked off on mount rather than left to the markup and to TugOfWar's own
   * effect, so the image request and the tally request start together at the
   * top of the render instead of one after the other.
   *
   * Both are fire-and-forget. If either fails nothing changes: the <img>
   * fetches normally and TugOfWar makes its own request.
   */
  useEffect(() => {
    new Image().src = handImg
    primeTally()
  }, [])

  return (
    <section className="relative overflow-hidden px-gutter py-20 sm:py-28">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="font-mono text-[10px] uppercase tracking-[.35em] text-muted">
          Toronto &amp; Waterloo &middot; September 12&ndash;13, 2026
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
            className="pointer-events-none absolute left-1/2 top-2 z-0 w-[86%] max-w-[440px] -translate-x-1/2 select-none opacity-[0.18] drop-shadow-[0_0_90px_rgba(139,167,218,0.3)] sm:top-0 sm:max-w-[520px]"
          />
          <h1 className="hero-title relative z-10 mt-6 bg-gradient-to-r from-signal via-ink to-waterloo bg-clip-text font-display text-5xl font-black uppercase leading-[1.05] tracking-tight text-transparent sm:text-7xl">
            Battle of the
            <br />
            Schools
          </h1>
        </div>

        {/* The panels say "Vote UofT" and "Vote Waterloo" on them; a line
            above telling you to vote for your school was restating the
            buttons. The spacing it used to occupy moves onto the panels. */}
        <div className="relative z-10 mt-12 w-full">
          <FactionChoice />
        </div>
      </div>
    </section>
  )
}
