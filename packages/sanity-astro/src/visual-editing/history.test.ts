import {describe, expect, it, vi} from 'vitest'
import {applyPresentationHistoryUpdate, getPresentationUrl, shouldPublishUrl} from './history'

describe('visual editing history helpers', () => {
  it('builds a presentation URL from location parts', () => {
    expect(
      getPresentationUrl({
        pathname: '/movies/abc',
        search: '?draft=true',
        hash: '#cast',
      }),
    ).toBe('/movies/abc?draft=true#cast')
  })

  it('publishes only when url changes', () => {
    expect(shouldPublishUrl('/movies/abc', '/movies/abc')).toBe(false)
    expect(shouldPublishUrl('/movies/abc', '/movies/def')).toBe(true)
  })

  it('applies push and replace updates using navigation callbacks', () => {
    const assign = vi.fn()
    const replace = vi.fn()
    const back = vi.fn()

    applyPresentationHistoryUpdate(
      {type: 'push', url: '/movies/abc'},
      'http://localhost:4321/movies/def',
      {assign, replace, back},
    )
    expect(assign).toHaveBeenCalledWith('/movies/abc')
    expect(replace).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()

    assign.mockReset()
    replace.mockReset()
    back.mockReset()

    applyPresentationHistoryUpdate(
      {type: 'replace', url: '/movies/xyz'},
      'http://localhost:4321/movies/def',
      {assign, replace, back},
    )
    expect(replace).toHaveBeenCalledWith('/movies/xyz')
    expect(assign).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('applies pop updates and skips duplicate navigations', () => {
    const assign = vi.fn()
    const replace = vi.fn()
    const back = vi.fn()

    applyPresentationHistoryUpdate(
      {type: 'pop', url: '/movies/abc'},
      'http://localhost:4321/movies/def',
      {assign, replace, back},
    )
    expect(back).toHaveBeenCalledTimes(1)

    assign.mockReset()
    replace.mockReset()
    back.mockReset()

    applyPresentationHistoryUpdate(
      {type: 'push', url: 'http://localhost:4321/movies/abc'},
      'http://localhost:4321/movies/abc',
      {assign, replace, back},
    )
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })
})
