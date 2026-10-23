// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'

import {HOST_TAG, install} from './bootstrap'

function deferredLoad() {
  const stop = vi.fn()
  const start = vi.fn(() => stop)
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const pending = new Promise<{start: typeof start}>((next, fail) => {
    resolve = () => next({start})
    reject = fail
  })
  return {load: vi.fn(() => pending), resolve, reject, start, stop}
}

function mountHost() {
  const host = document.createElement(HOST_TAG)
  document.body.appendChild(host)
  return host
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('install', () => {
  it('loads the client once for the host on the page and stops it on uninstall', async () => {
    const host = mountHost()
    const client = deferredLoad()

    const uninstall = install({load: client.load})
    expect(client.load).toHaveBeenCalledTimes(1)
    client.resolve()
    await flush()
    expect(client.start).toHaveBeenCalledWith(host)

    uninstall()
    expect(client.stop).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('astro:page-load'))
    expect(client.load).toHaveBeenCalledTimes(1)
  })

  it('never loads the client when the page has no host', async () => {
    const client = deferredLoad()

    const uninstall = install({load: client.load})
    document.dispatchEvent(new Event('astro:page-load'))
    await flush()

    expect(client.load).not.toHaveBeenCalled()
    uninstall()
  })

  it('keeps the running client across page-load events for the same host', async () => {
    mountHost()
    const client = deferredLoad()
    const uninstall = install({load: client.load})
    client.resolve()
    await flush()

    document.dispatchEvent(new Event('astro:page-load'))
    document.dispatchEvent(new Event('astro:page-load'))
    await flush()

    expect(client.load).toHaveBeenCalledTimes(1)
    expect(client.start).toHaveBeenCalledTimes(1)
    expect(client.stop).not.toHaveBeenCalled()
    uninstall()
  })

  it('starts only once when page-load fires again while the import is still pending', async () => {
    mountHost()
    const client = deferredLoad()
    const uninstall = install({load: client.load})

    document.dispatchEvent(new Event('astro:page-load'))
    client.resolve()
    await flush()

    expect(client.load).toHaveBeenCalledTimes(1)
    expect(client.start).toHaveBeenCalledTimes(1)
    uninstall()
  })

  it('tears down before a swap and binds to the new host after it', async () => {
    const first = mountHost()
    const client = deferredLoad()
    const uninstall = install({load: client.load})
    client.resolve()
    await flush()
    expect(client.start).toHaveBeenLastCalledWith(first)

    document.dispatchEvent(new Event('astro:before-swap'))
    expect(client.stop).toHaveBeenCalledTimes(1)
    first.remove()
    const second = mountHost()
    document.dispatchEvent(new Event('astro:page-load'))
    await flush()

    expect(client.start).toHaveBeenCalledTimes(2)
    expect(client.start).toHaveBeenLastCalledWith(second)
    uninstall()
  })

  it('does not start a client whose import finished after the page was swapped away', async () => {
    mountHost()
    const client = deferredLoad()
    const uninstall = install({load: client.load})

    document.dispatchEvent(new Event('astro:before-swap'))
    client.resolve()
    await flush()

    expect(client.start).not.toHaveBeenCalled()
    uninstall()
  })

  it('reports a failed import and leaves the page running', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mountHost()
    const client = deferredLoad()
    const uninstall = install({load: client.load})

    client.reject(new Error('chunk 404'))
    await flush()

    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[0]).toMatch(/Failed to start Visual Editing/)
    expect(() => uninstall()).not.toThrow()
  })

  it('retries on the next page-load after a failed start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mountHost()
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    let attempt = 0
    const load = vi.fn(async () => {
      attempt++
      if (attempt === 1) {
        throw new Error('chunk 404')
      }
      return {start}
    })
    const uninstall = install({load})
    await flush()

    expect(start).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('astro:page-load'))
    await flush()

    expect(load).toHaveBeenCalledTimes(2)
    expect(start).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    uninstall()
  })
})
