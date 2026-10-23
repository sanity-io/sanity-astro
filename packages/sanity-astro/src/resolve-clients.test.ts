import {describe, expect, it} from 'vitest'

import {resolveClientConfigs} from './resolve-clients'

const defaults = {apiVersion: 'v2023-08-24'}

describe('resolveClientConfigs', () => {
  it('maps top-level client options to the default client when `clients` is omitted', () => {
    expect(
      resolveClientConfigs({
        clientConfig: {projectId: 'main', dataset: 'marketing'},
        clients: undefined,
        defaults,
      }),
    ).toEqual({
      clients: {default: {apiVersion: 'v2023-08-24', projectId: 'main', dataset: 'marketing'}},
      presentationClientName: 'default',
    })
  })

  it('still produces a default client when nothing is configured', () => {
    expect(resolveClientConfigs({clientConfig: {}, clients: undefined, defaults})).toEqual({
      clients: {default: defaults},
      presentationClientName: 'default',
    })
  })

  it('applies defaults to every named client and lets each client override them', () => {
    const resolved = resolveClientConfigs({
      clientConfig: {},
      clients: {
        default: {projectId: 'main', dataset: 'marketing'},
        community: {projectId: 'community', dataset: 'marketing', apiVersion: 'v2024-01-01'},
      },
      defaults,
    })

    expect(resolved.clients).toEqual({
      default: {apiVersion: 'v2023-08-24', projectId: 'main', dataset: 'marketing'},
      community: {apiVersion: 'v2024-01-01', projectId: 'community', dataset: 'marketing'},
    })
  })

  it('uses top-level client options as the default client next to named clients', () => {
    const resolved = resolveClientConfigs({
      clientConfig: {projectId: 'main', dataset: 'marketing'},
      clients: {community: {projectId: 'community', dataset: 'marketing'}},
      defaults,
    })

    expect(Object.keys(resolved.clients)).toEqual(['community', 'default'])
    expect(resolved.clients.default).toEqual({
      apiVersion: 'v2023-08-24',
      projectId: 'main',
      dataset: 'marketing',
    })
  })

  it('rejects top-level client options combined with `clients.default`', () => {
    expect(() =>
      resolveClientConfigs({
        clientConfig: {projectId: 'main'},
        clients: {default: {projectId: 'other'}},
        defaults,
      }),
    ).toThrow(/Top-level client options and `clients.default` can not be combined/)
  })

  it('requires a default client when `clients` is used', () => {
    expect(() =>
      resolveClientConfigs({
        clientConfig: {},
        clients: {community: {projectId: 'community'}},
        defaults,
      }),
    ).toThrow(/`clients.default` is required/)
  })

  it('rejects non-object `clients` and client configs', () => {
    expect(() => resolveClientConfigs({clientConfig: {}, clients: [] as never, defaults})).toThrow(
      /`clients` option must be an object/,
    )
    expect(() =>
      resolveClientConfigs({
        clientConfig: {},
        clients: {default: {}, community: 'nope' as never},
        defaults,
      }),
    ).toThrow(/config for client "community" must be an object/)
    expect(() =>
      resolveClientConfigs({clientConfig: {}, clients: {'default': {}, ' ': {}}, defaults}),
    ).toThrow(/must be non-empty strings/)
  })

  it('strips `presentation` from the client config and records the presentation client', () => {
    const resolved = resolveClientConfigs({
      clientConfig: {},
      clients: {
        default: {projectId: 'main', dataset: 'marketing'},
        community: {projectId: 'community', dataset: 'marketing', presentation: true},
      },
      defaults,
    })

    expect(resolved.presentationClientName).toBe('community')
    expect(resolved.clients.community).not.toHaveProperty('presentation')
  })

  it('treats `presentation: false` as not marked', () => {
    const resolved = resolveClientConfigs({
      clientConfig: {},
      clients: {default: {presentation: false}, community: {}},
      defaults,
    })

    expect(resolved.presentationClientName).toBe('default')
    expect(resolved.clients.default).not.toHaveProperty('presentation')
  })

  it('rejects more than one presentation client', () => {
    expect(() =>
      resolveClientConfigs({
        clientConfig: {},
        clients: {default: {presentation: true}, community: {presentation: true}},
        defaults,
      }),
    ).toThrow(/Only one client can set `presentation: true`, found it on: "default", "community"/)
  })
})
