import {type Mock, vi} from 'vitest'

export interface MockedLocation {
  reload: Mock<() => void>
  restore: () => void
}

/**
 * jsdom does not implement `location.reload`, and `window.location` cannot be spied on, so the
 * whole object is swapped for a proxy that reads through to the live `Location` (so `pushState`
 * still shows in `href`) and answers `reload` with a mock. Call `restore` when done.
 */
export function mockLocationReload(): MockedLocation {
  const original = Object.getOwnPropertyDescriptor(window, 'location')
  if (!original?.get) {
    throw new Error('window.location is not an own accessor; is this a jsdom environment?')
  }
  const live = () => original.get!.call(window) as Location
  const reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new Proxy({} as Location, {
      get: (_, property) => {
        if (property === 'reload') {
          return reload
        }
        const value = Reflect.get(live(), property)
        return typeof value === 'function' ? value.bind(live()) : value
      },
      set: (_, property, value) => Reflect.set(live(), property, value),
    }),
  })
  return {
    reload,
    restore: () => {
      Object.defineProperty(window, 'location', original)
    },
  }
}
