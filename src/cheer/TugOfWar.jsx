import { useEffect, useState } from 'react'
import { fetchTally, subscribeTally } from './cheerClient'
import { factionLabel } from '../theme/tokens'

/** Neither side ever drops below this, so the bar reads as contested
 *  territory rather than a scoreline. */
const FLOOR = 10

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
  const raw = total === 0 ? 50 : (tally.utmist / total) * 100
  const share = Math.min(100 - FLOOR, Math.max(FLOOR, raw))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[.24em]">
        <span className="text-signal">{factionLabel.utmist}</span>
        <span className="text-waterloo">{factionLabel.watai}</span>
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(raw)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of cheers for UTMIST versus WAT.ai"
        className="flex h-3 w-full overflow-hidden rounded-full border border-signal/60"
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
