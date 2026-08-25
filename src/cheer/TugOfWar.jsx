import { useEffect, useState } from 'react'
import { fetchTally } from './cheerClient'
import { factionLabel } from '../theme/tokens'

/** Neither side ever drops below this, so the bar reads as contested
 *  territory rather than a scoreline. */
const FLOOR = 10

export default function TugOfWar() {
  const [tally, setTally] = useState({ utmist: 0, watai: 0 })

  useEffect(() => {
    let alive = true
    fetchTally().then((next) => { if (alive) setTally(next) })
    return () => { alive = false }
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
        <div
          data-testid="tug-watai"
          className="h-full bg-waterloo transition-[width] duration-700 ease-out"
          style={{ width: `${100 - share}%` }}
        />
      </div>
    </div>
  )
}
