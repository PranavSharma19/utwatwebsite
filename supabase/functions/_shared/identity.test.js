import { describe, it, expect } from 'vitest'
import {
  createRateLimiter,
  extractIp,
  isAllowedHostname,
  isIpAddress,
  normalizeIp,
  parseList,
  RATE_LIMIT_MAX_REQUESTS,
  resolveAllowedOrigin,
} from './identity.ts'

/**
 * These run in Vitest, not Deno — the functions under test are pure, so they
 * need neither runtime nor database. That matters because this is the logic
 * whose failures are invisible: a bad normalization doesn't throw, it just
 * quietly merges strangers into one voter, and you'd only notice from a tally
 * that stopped moving.
 */

const headers = (init) => new Headers(init)

describe('extractIp', () => {
  it('prefers cf-connecting-ip, which only Cloudflare can write', () => {
    expect(
      extractIp(headers({
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '198.51.100.1, 203.0.113.7',
      })),
    ).toBe('203.0.113.7')
  })

  // The whole point of the header ordering. A client that sends its own
  // X-Forwarded-For gets that entry pushed leftward by every real hop.
  it('ignores a client-forged leftmost x-forwarded-for entry', () => {
    const forged = extractIp(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))
    expect(forged).toBe('203.0.113.7')
    expect(forged).not.toBe('1.2.3.4')
  })

  it('takes the rightmost entry through several hops', () => {
    expect(
      extractIp(headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2, 203.0.113.7' })),
    ).toBe('203.0.113.7')
  })

  it('falls through blank header values rather than adopting them', () => {
    expect(extractIp(headers({ 'cf-connecting-ip': '   ', 'x-forwarded-for': '203.0.113.7' })))
      .toBe('203.0.113.7')
    expect(extractIp(headers({ 'x-forwarded-for': ' , , ' }))).toBe('unknown')
    expect(extractIp(headers({}))).toBe('unknown')
  })

  it('trims surrounding whitespace', () => {
    expect(extractIp(headers({ 'x-forwarded-for': '10.0.0.1,   203.0.113.7  ' })))
      .toBe('203.0.113.7')
  })
})

describe('normalizeIp', () => {
  it('passes IPv4 and the unknown fallback through untouched', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7')
    expect(normalizeIp('unknown')).toBe('unknown')
  })

  it('collapses IPv6 to its /64 prefix so a household is one voter', () => {
    expect(normalizeIp('2001:db8:85a3:1234:5678:8a2e:370:7334'))
      .toBe('2001:0db8:85a3:1234')
  })

  // RFC 4941 rotates the low 64 bits on a schedule. If that minted a new
  // identity the same person could cheer all day.
  it('gives a rotating privacy-extension address one stable identity', () => {
    const morning = normalizeIp('2001:db8:85a3:1234:aaaa:bbbb:cccc:dddd')
    const evening = normalizeIp('2001:db8:85a3:1234:1111:2222:3333:4444')
    expect(morning).toBe(evening)
  })

  it('keeps distinct /64s distinct', () => {
    expect(normalizeIp('2001:db8:85a3:1234::1'))
      .not.toBe(normalizeIp('2001:db8:85a3:5678::1'))
  })

  it('expands :: before slicing', () => {
    expect(normalizeIp('2001:db8::1')).toBe('2001:0db8:0000:0000')
    expect(normalizeIp('fe80::1')).toBe('fe80:0000:0000:0000')
  })

  it('strips a zone index', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80:0000:0000:0000')
  })

  // The bug this class of address caused: every IPv4-mapped client used to
  // normalize to the same all-zero prefix, which is one shared vote and one
  // shared rate-limit bucket for all of them.
  it('unwraps IPv4-mapped addresses instead of collapsing them together', () => {
    expect(normalizeIp('::ffff:203.0.113.5')).toBe('203.0.113.5')
    expect(normalizeIp('::ffff:8.8.8.8')).toBe('8.8.8.8')
    expect(normalizeIp('::ffff:203.0.113.5')).not.toBe(normalizeIp('::ffff:8.8.8.8'))
  })

  it('unwraps the IPv4-compatible form too', () => {
    expect(normalizeIp('::203.0.113.5')).toBe('203.0.113.5')
  })
})

describe('isIpAddress', () => {
  it('accepts real addresses', () => {
    expect(isIpAddress('203.0.113.7')).toBe(true)
    expect(isIpAddress('2001:db8::1')).toBe(true)
  })

  it('rejects the unknown fallback, so remoteip is omitted rather than invalid', () => {
    expect(isIpAddress('unknown')).toBe(false)
  })

  it('rejects out-of-range octets and junk', () => {
    expect(isIpAddress('999.0.0.1')).toBe(false)
    expect(isIpAddress('not-an-ip')).toBe(false)
    expect(isIpAddress('')).toBe(false)
  })
})

describe('rate limiter', () => {
  const at = (t) => () => t

  it('allows a burst up to the limit, then refuses', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter({ now: () => clock })
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      expect(limiter.check('203.0.113.7').allowed).toBe(true)
    }
    expect(limiter.check('203.0.113.7').allowed).toBe(false)
  })

  it('reports how long to wait', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter({ now: () => clock })
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) limiter.check('a')
    clock += 20_000
    const blocked = limiter.check('a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(40)
  })

  it('never reports a wait below one second', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter({ now: () => clock })
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) limiter.check('a')
    clock += 59_999
    expect(limiter.check('a').retryAfterSeconds).toBe(1)
  })

  it('lets the window slide', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter({ now: () => clock })
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) limiter.check('a')
    expect(limiter.check('a').allowed).toBe(false)
    clock += 60_001
    expect(limiter.check('a').allowed).toBe(true)
  })

  // One noisy visitor must not be able to lock everyone else out.
  it('buckets each IP separately', () => {
    const limiter = createRateLimiter({ now: at(1_000_000) })
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) limiter.check('a')
    expect(limiter.check('a').allowed).toBe(false)
    expect(limiter.check('b').allowed).toBe(true)
  })

  it('drops a one-off visitor rather than holding an empty array forever', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter({ now: () => clock })
    limiter.check('a')
    expect(limiter.size()).toBe(1)
    clock += 60_001
    limiter.check('b')
    // 'a' aged out and was deleted when its own key was next touched.
    limiter.check('a')
    expect(limiter.size()).toBe(2)
  })

  // The leak guard: without the sweep, a public endpoint accumulates one
  // resident entry per distinct IP it has ever seen.
  it('sweeps aged-out entries once the map grows past its threshold', () => {
    let clock = 1_000_000
    const limiter = createRateLimiter({ now: () => clock, sweepThreshold: 10 })
    for (let i = 0; i < 12; i++) limiter.check(`ip-${i}`)
    expect(limiter.size()).toBe(12)
    clock += 60_001
    limiter.check('trigger')
    expect(limiter.size()).toBe(1)
  })
})

/**
 * The site answers on two addresses -- utwat.ca and www.utwat.ca -- and both
 * of these were single-valued, so whichever one was not configured got a
 * CORS-blocked tally and a captcha whose hostname never matched. Both fail
 * silently: the client swallows errors, so the symptom is a poll that simply
 * never counts anyone arriving on the wrong host.
 */
const SITE = ['https://utwat.ca', 'https://www.utwat.ca']

describe('parseList', () => {
  it('splits, trims, and drops the gaps', () => {
    expect(parseList('https://a.ca, https://b.ca')).toEqual(['https://a.ca', 'https://b.ca'])
    expect(parseList('  https://a.ca ,, https://b.ca ,')).toEqual(['https://a.ca', 'https://b.ca'])
  })

  it('treats unset, empty and whitespace as no entries', () => {
    for (const v of [undefined, '', '   ', ',,,']) expect(parseList(v)).toEqual([])
  })

  it('leaves a single value working exactly as before', () => {
    expect(parseList('https://utwat.ca')).toEqual(['https://utwat.ca'])
  })
})

describe('resolveAllowedOrigin', () => {
  // The header carries exactly one origin, so an allowlist has to echo the
  // caller's rather than joining the list.
  it('echoes whichever allowed origin is calling', () => {
    expect(resolveAllowedOrigin('https://utwat.ca', SITE)).toBe('https://utwat.ca')
    expect(resolveAllowedOrigin('https://www.utwat.ca', SITE)).toBe('https://www.utwat.ca')
  })

  it('does not echo an origin that is not on the list', () => {
    expect(resolveAllowedOrigin('https://evil.example', SITE)).not.toBe('https://evil.example')
  })

  it('falls back to the first entry for a caller that sends no origin', () => {
    // curl and other non-browser callers; they ignore the header anyway.
    expect(resolveAllowedOrigin(null, SITE)).toBe('https://utwat.ca')
  })

  it('returns null when nothing is configured, so the caller can refuse', () => {
    expect(resolveAllowedOrigin('https://utwat.ca', [])).toBeNull()
    expect(resolveAllowedOrigin(null, [])).toBeNull()
  })

  it('is exact: a subdomain or scheme mismatch is not a match', () => {
    expect(resolveAllowedOrigin('http://utwat.ca', SITE)).not.toBe('http://utwat.ca')
    expect(resolveAllowedOrigin('https://utwat.ca.evil.example', SITE))
      .not.toBe('https://utwat.ca.evil.example')
  })
})

describe('isAllowedHostname', () => {
  const HOSTS = ['utwat.ca', 'www.utwat.ca']

  it('accepts every host the site actually serves', () => {
    for (const h of HOSTS) expect(isAllowedHostname(h, HOSTS)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isAllowedHostname('evil.example', HOSTS)).toBe(false)
    expect(isAllowedHostname('utwat.ca.evil.example', HOSTS)).toBe(false)
  })

  // Turnstile's response shape is not ours to trust.
  it('rejects a missing or non-string hostname', () => {
    for (const v of [undefined, null, 42, {}, []]) {
      expect(isAllowedHostname(v, HOSTS)).toBe(false)
    }
  })

  // Fails closed: an unconfigured allowlist must not accept a token solved
  // on someone else's page that merely embeds our public sitekey.
  it('accepts nothing when the allowlist is empty', () => {
    expect(isAllowedHostname('utwat.ca', [])).toBe(false)
  })
})
