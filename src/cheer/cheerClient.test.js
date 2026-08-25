import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchTally, submitCheer, subscribeTally } from './cheerClient'

describe('cheerClient', () => {
  beforeEach(() => {
    import.meta.env.VITE_SUPABASE_URL = 'http://localhost:54321'
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('returns the tally on success', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 7, watai: 5 }) })
    await expect(fetchTally()).resolves.toEqual({ utmist: 7, watai: 5 })
  })

  it('returns zeroes rather than throwing when the network fails', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await expect(fetchTally()).resolves.toEqual({ utmist: 0, watai: 0 })
  })

  it('returns zeroes rather than throwing on a server error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(fetchTally()).resolves.toEqual({ utmist: 0, watai: 0 })
  })

  it('posts the faction and captcha token', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 1, watai: 0 }) })
    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })
    const [, init] = fetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ faction: 'utmist', turnstileToken: 'tok' })
  })

  it('refuses an unknown faction without calling the network', async () => {
    await expect(submitCheer({ faction: 'mit', turnstileToken: 't' }))
      .resolves.toEqual({ utmist: 0, watai: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('coerces malformed counts to zero', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 'lots' }) })
    await expect(fetchTally()).resolves.toEqual({ utmist: 0, watai: 0 })
  })

  // Supabase's function gateway 401s an unauthenticated call before the
  // function ever runs, and this client swallows failures by contract — so
  // a missing apikey shows up as a tally frozen at 0/0 and nothing else.
  // Every other Edge Function call in the repo goes through
  // supabase-js's functions.invoke, which attaches these for free.
  it('authenticates the read with the project anon key', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 1, watai: 1 }) })
    await fetchTally()
    const [, init] = fetch.mock.calls[0]
    expect(init.headers.apikey).toBe('anon-key')
    expect(init.headers.Authorization).toBe('Bearer anon-key')
  })

  it('authenticates the write with the project anon key', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 1, watai: 0 }) })
    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })
    const [, init] = fetch.mock.calls[0]
    expect(init.headers.apikey).toBe('anon-key')
    expect(init.headers.Authorization).toBe('Bearer anon-key')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('sends no auth headers at all when no key is configured', async () => {
    import.meta.env.VITE_SUPABASE_ANON_KEY = ''
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 1, watai: 1 }) })
    await fetchTally()
    const [, init] = fetch.mock.calls[0]
    expect(init.headers.apikey).toBeUndefined()
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('publishes the tally a successful cheer returns', async () => {
    const seen = vi.fn()
    const unsubscribe = subscribeTally(seen)
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 9, watai: 3 }) })

    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })

    expect(seen).toHaveBeenCalledWith({ utmist: 9, watai: 3 })
    unsubscribe()
  })

  // A failed cheer returns zeroes by design. Publishing those would yank a
  // populated bar back to an even split — worse than leaving it alone.
  it('publishes nothing when the cheer fails', async () => {
    const seen = vi.fn()
    const unsubscribe = subscribeTally(seen)

    fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })
    fetch.mockRejectedValue(new Error('offline'))
    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })

    expect(seen).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('stops notifying an unsubscribed listener', async () => {
    const seen = vi.fn()
    subscribeTally(seen)()
    fetch.mockResolvedValue({ ok: true, json: async () => ({ utmist: 1, watai: 1 }) })
    await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })
    expect(seen).not.toHaveBeenCalled()
  })
})
