import { describe, expect, it, mock } from 'bun:test'
import { buildQuotaOperationError } from '../core/backoff.ts'
import { codexRefreshFn, type ProviderHttpError } from '../core/provider.ts'

describe('buildQuotaOperationError retryAfter threading', () => {
  it('honors positive retryAfter on quota error', () => {
    const error = Object.assign(new Error('Rate limit exceeded'), {
      status: 429,
      retryAfter: 3600,
    })
    const now = 1000000
    const result = buildQuotaOperationError({
      error,
      now,
    })
    expect(result.nextRetryAt).toBe(now + 3600 * 1000)
  })

  it('falls back to transient backoff when retryAfter is missing', () => {
    const error = Object.assign(new Error('Rate limit exceeded'), {
      status: 429,
    })
    const now = 1000000
    const result = buildQuotaOperationError({
      error,
      now,
    })
    // Transient quota error delay starts at MIN_QUOTA_RETRY_DELAY_MS (60_000)
    expect(result.nextRetryAt).toBe(now + 60_000)
  })
})

describe('codexRefreshFn token validation', () => {
  const mockNow = () => 1000000

  it('returns tokens when response is valid', async () => {
    const mockFetch = mock(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'valid-access',
          refresh_token: 'valid-refresh',
          expires_in: 3600,
        }),
        { status: 200 },
      )
    })

    const result = await codexRefreshFn({
      refreshToken: 'some-refresh',
      fetchImpl: mockFetch as unknown as typeof fetch,
      now: mockNow,
    })

    expect(result.access).toBe('valid-access')
    expect(result.refresh).toBe('valid-refresh')
    expect(result.expiresIn).toBe(3600)
    expect(result.expires).toBe(mockNow() + 3600 * 1000)
  })

  it('throws structured refresh error when access_token is missing', async () => {
    const mockFetch = mock(async () => {
      return new Response(
        JSON.stringify({
          refresh_token: 'valid-refresh',
          expires_in: 3600,
        }),
        { status: 200 },
      )
    })

    let thrown: ProviderHttpError | undefined
    try {
      await codexRefreshFn({
        refreshToken: 'some-refresh',
        fetchImpl: mockFetch as unknown as typeof fetch,
        now: mockNow,
      })
    } catch (e) {
      thrown = e as ProviderHttpError
    }

    expect(thrown).toBeDefined()
    expect(thrown?.message).toContain('malformed response')
    expect(thrown?.status).toBe(200)
    expect(thrown?.isRefreshError).toBe(true)
  })

  it('throws structured refresh error when refresh_token is missing', async () => {
    const mockFetch = mock(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'valid-access',
          expires_in: 3600,
        }),
        { status: 200 },
      )
    })

    let thrown: ProviderHttpError | undefined
    try {
      await codexRefreshFn({
        refreshToken: 'some-refresh',
        fetchImpl: mockFetch as unknown as typeof fetch,
        now: mockNow,
      })
    } catch (e) {
      thrown = e as ProviderHttpError
    }

    expect(thrown).toBeDefined()
    expect(thrown?.message).toContain('malformed response')
    expect(thrown?.status).toBe(200)
    expect(thrown?.isRefreshError).toBe(true)
  })

  it('throws structured refresh error when expires_in is missing or not a number', async () => {
    const mockFetch = mock(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'valid-access',
          refresh_token: 'valid-refresh',
          expires_in: '3600', // string instead of number
        }),
        { status: 200 },
      )
    })

    let thrown: ProviderHttpError | undefined
    try {
      await codexRefreshFn({
        refreshToken: 'some-refresh',
        fetchImpl: mockFetch as unknown as typeof fetch,
        now: mockNow,
      })
    } catch (e) {
      thrown = e as ProviderHttpError
    }

    expect(thrown).toBeDefined()
    expect(thrown?.message).toContain('malformed response')
    expect(thrown?.status).toBe(200)
    expect(thrown?.isRefreshError).toBe(true)
  })
})
