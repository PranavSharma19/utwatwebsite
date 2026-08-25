import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { FACTIONS } from '../theme/tokens'
import { readFaction, writeFaction, clearFaction } from './factionStorage'

const FactionContext = createContext(null)

/**
 * Owns the visitor's chosen side and mirrors it onto <html data-faction="...">.
 *
 * Theming is done entirely in CSS from that one attribute (see the
 * [data-faction] rules in src/index.css), so no consuming component needs to
 * know which faction is active — it just uses the `accent` colour utilities.
 *
 * Neutral (no choice) is a fully supported state: the attribute is absent and
 * :root supplies a neutral accent that favours neither school.
 */
export function FactionProvider({ children }) {
  const [faction, setFaction] = useState(() => readFaction())

  useEffect(() => {
    const root = document.documentElement
    if (faction) root.setAttribute('data-faction', faction)
    else root.removeAttribute('data-faction')
  }, [faction])

  // Allegiance is permanent. Once a side is picked it cannot be swapped: the
  // tally counts one cheer per visitor, so letting someone flip back and
  // forth would make the choice meaningless and the bar a toy. Enforced here
  // rather than in the UI so no future caller can route around it.
  //
  // `clear()` below still resets — it exists for tests and for a deliberate
  // reset, and is not wired to anything a visitor can reach.
  const choose = useCallback((next) => {
    if (!FACTIONS.includes(next)) return
    setFaction((current) => {
      if (current !== null) return current
      writeFaction(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setFaction(null)
    clearFaction()
  }, [])

  const value = useMemo(
    () => ({ faction, hasChosen: faction !== null, choose, clear }),
    [faction, choose, clear],
  )

  return <FactionContext.Provider value={value}>{children}</FactionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook lives alongside its provider
export function useFaction() {
  const ctx = useContext(FactionContext)
  if (!ctx) throw new Error('useFaction must be used inside a FactionProvider')
  return ctx
}
