import { useEffect, useState } from 'react'
import { fetchTally, subscribeTally } from './cheerClient'
import { factionSchool } from '../theme/tokens'

/** Neither side's *bar* ever drops below this, so a lopsided split still reads
 *  as contested territory. The percentages shown are the true ones — only the
 *  fill is floored, never the number. */
const FLOOR = 10

function pct(n) {
  return `${Math.round(n)}%`
}

export default function TugOfWar() {
  const [tally, setTally] = useState({ utmist: 0, watai: 0 })

  useEffect(() => {
    let alive = true
    fetchTally().then((next) => { if (alive) setTally(next) })
    // A cheer submitted from the hero publishes the tally it got back, so
    // the bar reflects the visitor's own pick in the same session instead of
    // being frozen at whatever the mount-time fetch returned.
    const unsubscribe = subscribeTally((next) => { if (alive) setTally(next) })
    return () => { alive = false; unsubscribe() }
  }, [])

  const total = tally.utmist + tally.watai
  const empty = total === 0
  const raw = empty ? 50 : (tally.utmist / total) * 100
  const share = Math.min(100 - FLOOR, Math.max(FLOOR, raw))

  return (
    <div className="mx-auto max-w-3xl">
      {/*
        The numbers are what make this read as a poll rather than as decoration.
        They are percentages plus a total rather than two raw scores: the event
        is co-hosted, so a bare scoreline puts one of the two host orgs on their
        own homepage losing. A share and a turnout say the same thing without
        printing a defeat.
      */}
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="text-left">
          <div className="font-mono text-[10px] tracking-[.24em] text-signal">
            {factionSchool.utmist}
          </div>
          <div className="font-display text-2xl font-bold leading-none text-signal sm:text-3xl">
            {empty ? '—' : pct(raw)}
          </div>
        </div>

        <div className="pb-1 text-center font-mono text-[10px] uppercase tracking-[.2em] text-muted">
          {empty
            ? 'No votes yet — be the first'
            : `${total.toLocaleString()} ${total === 1 ? 'vote' : 'votes'}`}
        </div>

        <div className="text-right">
          <div className="font-mono text-[10px] tracking-[.24em] text-waterloo">
            {factionSchool.watai}
          </div>
          <div className="font-display text-2xl font-bold leading-none text-waterloo sm:text-3xl">
            {empty ? '—' : pct(100 - raw)}
          </div>
        </div>
      </div>

      <div
        role="meter"
        aria-valuenow={Math.round(raw)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={
          empty
            ? 'No votes yet'
            : `${factionSchool.utmist} ${pct(raw)}, ${factionSchool.watai} ${pct(100 - raw)}, ${total} votes`
        }
        aria-label="Share of votes for UofT versus Waterloo"
        className="flex h-4 w-full overflow-hidden rounded-full border border-signal/60"
      >
        <div
          data-testid="tug-utmist"
          className="h-full bg-signal transition-[width] duration-700 ease-out"
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
          className="h-full bg-waterloo transition-[width] duration-700 ease-out"
          style={{ width: `${100 - share}%` }}
        />
      </div>
    </div>
  )
}
