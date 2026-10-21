import {type Mock, vi} from 'vitest'

export interface MockedLocation {
  reload: Mock<() => void>
  restore: () => void
}

/**
 * jsdom does not implement `location.reload`, and `window.location` cannot be spied on, so
 * the whole object is swapped for a plain copy with a mock `reload`. Call `restore` when done.
 */
export function mockLocationReload(href = window.location.href): MockedLocation {
  const original = Object.getOwnPropertyDescriptor(window, 'location')
  if (!original) {
    throw new Error('window.location is not an own property; is this a jsdom environment?')
  }
  const reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {...window.location, reload, href},
  })
  return {
    reload,
    restore: () => {
      Object.defineProperty(window, 'location', original)
    },
  }
}
