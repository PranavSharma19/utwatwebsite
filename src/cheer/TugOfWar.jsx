import { useEffect, useState } from 'react'
import { fetchTally, subscribeTally } from './cheerClient'
import { factionSchool } from '../theme/tokens'

/** Neither side's *bar* drops below this while both sides hold votes, so a
 *  lopsided split still reads as contested territory. The percentages shown
 *  are the true ones — only the fill is floored, never the number.
 *
 *  It does not apply to a shutout. Floored, 100/0 drew a bar at 90/10 while
 *  the label above it read 100%, and a strip of the other school's colour
 *  with no votes behind it reads as a rendering bug rather than as a
 *  courtesy. Softening a race nobody is losing yet is the point; inventing
 *  territory for a side that has nothing is not. */
const FLOOR = 10

function pct(n) {
  return `${Math.round(n)}%`
}

/** "1 vote", "2 votes" -- used by both the caption and the meter's label,
 *  which previously disagreed and left screen readers hearing "1 votes". */
function votes(total) {
  return `${total.toLocaleString()} ${total === 1 ? 'vote' : 'votes'}`
}

export default function TugOfWar() {
  // `reachable: null` is the pre-fetch state. It is distinct from `false` on
  // purpose: flashing "unavailable" for the moment before the first response
  // lands would cry wolf on every page load.
  const [tally, setTally] = useState({ utmist: 0, watai: 0, reachable: null })

  useEffect(() => {
    let alive = true
    fetchTally().then((next) => { if (alive) setTally(next) })
    // A cheer submitted from the hero publishes the tally it got back, so
    // the bar reflects the visitor's own pick in the same session instead of
    // being frozen at whatever the mount-time fetch returned.
    const unsubscribe = subscribeTally((next) => { if (alive) setTally(next) })
    return () => { alive = false; unsubscribe() }
  }, [])

  const unreachable = tally.reachable === false
  const pending = tally.reachable === null
  const total = tally.utmist + tally.watai
  const empty = total === 0
  // Real numbers are shown only when the server actually answered with them.
  const counted = tally.reachable === true && !empty
  const raw = counted ? (tally.utmist / total) * 100 : 50
  // Both sides must actually hold votes for the floor to mean anything.
  const contested = counted && tally.utmist > 0 && tally.watai > 0
  const share = contested ? Math.min(100 - FLOOR, Math.max(FLOOR, raw)) : raw

  // Deliberately not phrased as an error the visitor can act on -- they
  // cannot. It says the count is not live so that a frozen bar is legible as
  // a broken tracker instead of as a poll nobody has voted in.
  const caption = unreachable
    ? 'Live count unavailable'
    : pending
      ? '\u00A0' // holds the row's height until the first response lands
      : empty
        ? 'No votes yet — be the first'
        : votes(total)

  return (
    <div className="mx-auto max-w-3xl">
      {/*
        The numbers are what make this read as a poll rather than as decoration.
        They are percentages plus a total rather than two raw scores: the event
        is co-hosted, so a bare scoreline puts one of the two host orgs on their
        own homepage losing. A share and a turnout say the same thing without
        printing a defeat.
      */}
      {/*
        Two big percentages under two "Vote <school>" buttons were read as
        stats about the event itself -- who is applying, who is attending --
        by more than one visitor. The numbers cannot say what they are a
        share OF on their own, so the label does it, and it sits above both
        of them rather than beside either one.
      */}
      <div className="mb-1.5 text-center font-mono text-[10px] uppercase tracking-[.2em] text-muted">
        Share of the vote
      </div>
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="text-left">
          <div className="font-mono text-[10px] tracking-[.24em] text-signal">
            {factionSchool.utmist}
          </div>
          <div className="font-display text-2xl font-bold leading-none text-signal sm:text-3xl">
            {counted ? pct(raw) : '—'}
          </div>
        </div>

        <div
          data-testid="tug-caption"
          className="pb-1 text-center font-mono text-[10px] uppercase tracking-[.2em] text-muted"
        >
          {caption}
        </div>

        <div className="text-right">
          <div className="font-mono text-[10px] tracking-[.24em] text-waterloo">
            {factionSchool.watai}
          </div>
          <div className="font-display text-2xl font-bold leading-none text-waterloo sm:text-3xl">
            {counted ? pct(100 - raw) : '—'}
          </div>
        </div>
      </div>

      <div
        role="meter"
        aria-valuenow={Math.round(raw)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={
          unreachable
            ? 'Live count unavailable'
            : counted
              ? `${factionSchool.utmist} ${pct(raw)}, ${factionSchool.watai} ${pct(100 - raw)}, ${votes(total)}`
              : 'No votes yet'
        }
        aria-label="Share of votes for UofT versus Waterloo"
        className="flex h-4 w-full overflow-hidden rounded-full border border-signal/60"
      >
        <div
          data-testid="tug-utmist"
          className={`h-full transition-[width] duration-700 ease-out ${
            counted ? 'bg-signal' : 'bg-signal/30'
          }`}
          style={{ width: `${share}%` }}
        />
        {/*
          bg-signal against bg-waterloo is 1.71:1 — a hue change and almost
          nothing else. The boundary between the two territories is the whole
          point of this component, so it gets an explicit dark edge rather
          than relying on colour discrimination: void reads 8.03:1 against
          signal and 13.77:1 against waterloo, which survives tritanopia and
          a dim display alike.
        */}
        <div data-testid="tug-divide" aria-hidden="true" className="h-full w-[2px] shrink-0 bg-void" />
        <div
          data-testid="tug-watai"
          className={`h-full transition-[width] duration-700 ease-out ${
            counted ? 'bg-waterloo' : 'bg-waterloo/30'
          }`}
          style={{ width: `${100 - share}%` }}
        />
      </div>
    </div>
  )
}
