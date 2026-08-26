import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'

/**
 * FactionChoice.jsx reads VITE_TURNSTILE_SITE_KEY at MODULE LOAD time
 * (`const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()`),
 * so exercising the sitekey-present path requires stubbing the env var and
 * then re-importing the module fresh via vi.resetModules(). Everything the
 * freshly-imported FactionChoice depends on (FactionContext, cheerClient)
 * must ALSO be re-imported after the same reset, or the fresh component
 * ends up holding a different module instance (a different React Context
 * object, a different mock function) than the one the test asserts against.
 */

const turnstileReset = vi.fn()

// FactionChoice now renders TugOfWar beneath the arena, so the mock has to
// cover everything that subtree imports too, not just submitCheer.
vi.mock('../cheer/cheerClient', () => ({
  submitCheer: vi.fn().mockResolvedValue({ utmist: 0, watai: 0 }),
  // Plain functions, not vi.fn(): this file calls vi.resetAllMocks(), which
  // strips a spy's implementation and would leave fetchTally() returning
  // undefined. Nothing here asserts on the bar, so it just needs to behave.
  fetchTally: () => Promise.resolve({ utmist: 0, watai: 0 }),
  subscribeTally: () => () => {},
}))

vi.mock('@marsidev/react-turnstile', () => ({
  // A stand-in that exposes plain buttons a test can click to fire the
  // callbacks Turnstile would normally fire itself (onSuccess/onExpire/
  // onError), instead of trying to drive Cloudflare's real widget.
  Turnstile: forwardRef(function MockTurnstile({ siteKey, onSuccess, onExpire, onError }, ref) {
    useImperativeHandle(ref, () => ({ reset: turnstileReset }))
    return (
      <div data-testid="turnstile-widget" data-sitekey={siteKey}>
        <button type="button" onClick={() => onSuccess('token-1')}>fire-success</button>
        <button type="button" onClick={() => onExpire()}>fire-expire</button>
        <button type="button" onClick={() => onError()}>fire-error</button>
      </div>
    )
  }),
}))

// Fresh instances of FactionChoice, FactionProvider and submitCheer must all
// come from imports made after the same vi.resetModules() call. Importing
// them concurrently (Promise.all) races the module cache and can hand back
// two different mock instances for the same specifier, so these are
// deliberately sequential awaits, not a Promise.all.
const loadWithSitekey = async (sitekey) => {
  vi.resetModules()
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', sitekey)
  const { default: FactionChoice } = await import('./FactionChoice')
  const { FactionProvider } = await import('./FactionContext')
  const { submitCheer } = await import('../cheer/cheerClient')
  return { FactionChoice, FactionProvider, submitCheer }
}

describe('FactionChoice with a Turnstile sitekey configured', () => {
  beforeEach(() => {
    window.localStorage.clear()
    turnstileReset.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders the widget when a sitekey is present', async () => {
    const { FactionChoice, FactionProvider } = await loadWithSitekey('test-sitekey')
    render(<FactionProvider><FactionChoice /></FactionProvider>)
    expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument()
  })

  it('does not render the widget when the sitekey is absent', async () => {
    const { FactionChoice, FactionProvider } = await loadWithSitekey('')
    render(<FactionProvider><FactionChoice /></FactionProvider>)
    expect(screen.queryByTestId('turnstile-widget')).toBeNull()
  })

  it('submits a cheer with the token once onSuccess has fired', async () => {
    const user = userEvent.setup()
    const { FactionChoice, FactionProvider, submitCheer } = await loadWithSitekey('test-sitekey')
    render(<FactionProvider><FactionChoice /></FactionProvider>)

    // Token resolves before the pick this time.
    await user.click(screen.getByText('fire-success'))
    await user.click(screen.getByRole('button', { name: /vote uoft/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    expect(submitCheer).toHaveBeenCalledWith({ faction: 'utmist', turnstileToken: 'token-1' })
  })

  it('queues a pick made before the token arrives, then submits it once onSuccess fires', async () => {
    const user = userEvent.setup()
    const { FactionChoice, FactionProvider, submitCheer } = await loadWithSitekey('test-sitekey')
    render(<FactionProvider><FactionChoice /></FactionProvider>)

    // Pick happens first, before any token exists.
    await user.click(screen.getByRole('button', { name: /vote waterloo/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(submitCheer).not.toHaveBeenCalled()

    // Token now resolves — the deferred pick should submit exactly once.
    await user.click(screen.getByText('fire-success'))
    expect(submitCheer).toHaveBeenCalledTimes(1)
    expect(submitCheer).toHaveBeenCalledWith({ faction: 'watai', turnstileToken: 'token-1' })
  })

  it('resets the single-use token after a submit', async () => {
    const user = userEvent.setup()
    const { FactionChoice, FactionProvider } = await loadWithSitekey('test-sitekey')
    render(<FactionProvider><FactionChoice /></FactionProvider>)

    await user.click(screen.getByText('fire-success'))
    await user.click(screen.getByRole('button', { name: /vote uoft/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    expect(turnstileReset).toHaveBeenCalledTimes(1)
  })

  it('clears the token on expire so a subsequent pick does not submit a stale one', async () => {
    const user = userEvent.setup()
    const { FactionChoice, FactionProvider, submitCheer } = await loadWithSitekey('test-sitekey')
    render(<FactionProvider><FactionChoice /></FactionProvider>)

    await user.click(screen.getByText('fire-success'))
    await user.click(screen.getByText('fire-expire'))
    await user.click(screen.getByRole('button', { name: /vote uoft/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    // No token is currently held, so the pick is queued as pending rather
    // than submitted with a stale/expired token.
    expect(submitCheer).not.toHaveBeenCalled()
  })
})
