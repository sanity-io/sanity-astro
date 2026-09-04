// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {reloadPreservingScroll, restoreScroll} from './scroll'

const STORAGE_KEY = 'sanity-astro:scroll'

afterEach(() => {
  sessionStorage.clear()
})

describe('reloadPreservingScroll', () => {
  it('stores href and scroll offsets then reloads', () => {
    const reload = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'scrollX', {configurable: true, value: 12})
    Object.defineProperty(window, 'scrollY', {configurable: true, value: 80})
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        href: 'http://localhost/movies/walle',
        reload,
      },
    })

    try {
      reloadPreservingScroll()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
        href: 'http://localhost/movies/walle',
        x: 12,
        y: 80,
      })
    } finally {
      Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    }
  })

  it('still reloads when sessionStorage.setItem throws', () => {
    const reload = vi.fn()
    const win = {
      location: {href: 'http://localhost/movies', reload},
      scrollX: 1,
      scrollY: 2,
      sessionStorage: {
        setItem: () => {
          throw new Error('quota')
        },
      },
    } as unknown as Window

    reloadPreservingScroll(win)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('restoreScroll', () => {
  it('restores on the same href via requestAnimationFrame', () => {
    const scrollTo = vi.fn()
    const originalLocation = window.location
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({href: 'http://localhost/movies/walle', x: 12, y: 80}),
    )
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...originalLocation, href: 'http://localhost/movies/walle'},
    })
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo)

    try {
      expect(restoreScroll()).toBe(true)
      expect(scrollTo).toHaveBeenCalledWith({left: 12, top: 80, behavior: 'instant'})
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    } finally {
      raf.mockRestore()
      scrollSpy.mockRestore()
      Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    }
  })

  it('returns false when the saved href does not match', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({href: 'http://localhost/other', x: 1, y: 2}),
    )

    expect(restoreScroll()).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns false when nothing is saved', () => {
    expect(restoreScroll()).toBe(false)
  })

  it('returns false for corrupt JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, '{not-json')
    expect(restoreScroll()).toBe(false)
  })

  it('returns false when sessionStorage.getItem throws', () => {
    const win = {
      location: {href: 'http://localhost/movies'},
      sessionStorage: {
        getItem: () => {
          throw new Error('denied')
        },
      },
    } as unknown as Window

    expect(restoreScroll(win)).toBe(false)
  })
})
