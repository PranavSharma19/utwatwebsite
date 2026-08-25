import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchTally, submitCheer } from './cheerClient'

describe('cheerClient', () => {
  beforeEach(() => {
    import.meta.env.VITE_SUPABASE_URL = 'http://localhost:54321'
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
})
