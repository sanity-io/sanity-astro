// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {parseConfig, start} from './client'

type EnableOptions = {
  zIndex?: number
  keepStegaOnCopy?: boolean
  history: {subscribe: (navigate: unknown) => () => void; update: (update: unknown) => void}
  refresh: (payload: unknown) => unknown
}

const {disposeSpy, enableVisualEditing} = vi.hoisted(() => {
  const disposeSpy = vi.fn()
  return {
    disposeSpy,
    enableVisualEditing: vi.fn((_options: EnableOptions) => disposeSpy),
  }
})

vi.mock('@sanity/visual-editing/enable-visual-editing', () => ({
  enableVisualEditing,
}))

vi.mock('@sanity/visual-editing/optimistic', () => ({
  actor: {},
  listeners: new Set(),
  isEmptyActor: () => true,
}))

afterEach(() => {
  enableVisualEditing.mockClear()
  disposeSpy.mockClear()
  document.body.replaceChildren()
  sessionStorage.clear()
})

describe('parseConfig', () => {
  it('returns an empty object for null, invalid JSON, and non-objects', () => {
    expect(parseConfig(null)).toEqual({})
    expect(parseConfig('')).toEqual({})
    expect(parseConfig('{')).toEqual({})
    expect(parseConfig('12')).toEqual({})
    expect(parseConfig('null')).toEqual({})
  })

  it('drops fields with the wrong type', () => {
    expect(parseConfig(JSON.stringify({zIndex: '7', keepStegaOnCopy: 1, refresh: 'nope'}))).toEqual(
      {zIndex: undefined, keepStegaOnCopy: undefined, refresh: undefined},
    )
  })

  it('keeps a valid object', () => {
    expect(
      parseConfig(JSON.stringify({zIndex: 7, keepStegaOnCopy: true, refresh: 'reload'})),
    ).toEqual({zIndex: 7, keepStegaOnCopy: true, refresh: 'reload'})
    expect(parseConfig(JSON.stringify({refresh: 'morph'}))).toEqual({
      zIndex: undefined,
      keepStegaOnCopy: undefined,
      refresh: 'morph',
    })
  })
})

describe('start', () => {
  it('passes zIndex, keepStegaOnCopy, history and refresh into enableVisualEditing', () => {
    const host = document.createElement('div')
    host.setAttribute(
      'data-config',
      JSON.stringify({zIndex: 9, keepStegaOnCopy: true, refresh: 'morph'}),
    )
    document.body.appendChild(host)

    const stop = start(host)

    expect(enableVisualEditing).toHaveBeenCalledTimes(1)
    const options = enableVisualEditing.mock.calls[0][0]
    expect(options.zIndex).toBe(9)
    expect(options.keepStegaOnCopy).toBe(true)
    expect(options.history).toEqual(
      expect.objectContaining({
        subscribe: expect.any(Function),
        update: expect.any(Function),
      }),
    )
    expect(typeof options.refresh).toBe('function')

    stop()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('starts with empty options when data-config is missing', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const stop = start(host)
    const options = enableVisualEditing.mock.calls[0][0]
    expect(options.zIndex).toBeUndefined()
    expect(options.keepStegaOnCopy).toBeUndefined()
    expect(typeof options.refresh).toBe('function')

    stop()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
