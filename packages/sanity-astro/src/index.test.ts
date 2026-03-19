import {describe, expect, it, vi} from 'vitest'
import sanityIntegration from './index'

describe('sanity integration preview routes', () => {
  it('injects preview enable/disable routes when preview mode is configured', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      visualEditing: {
        token: 'token-value',
      },
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/visual-editing/draft-mode-enable.ts',
        pattern: '/preview/enable',
        prerender: false,
      }),
    )
    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/visual-editing/draft-mode-disable.ts',
        pattern: '/preview/disable',
        prerender: false,
      }),
    )
  })

  it('injects preview routes when preview mode is enabled without a token', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      visualEditing: {
        previewMode: true,
      },
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/visual-editing/draft-mode-enable.ts',
        pattern: '/preview/enable',
        prerender: false,
      }),
    )
    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/visual-editing/draft-mode-disable.ts',
        pattern: '/preview/disable',
        prerender: false,
      }),
    )
  })

  it('does not inject preview routes when preview mode is disabled', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      visualEditing: {
        token: 'token-value',
        previewMode: false,
      },
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({injectRoute, updateConfig, injectScript} as never)

    expect(
      injectRoute.mock.calls.some(
        ([route]) =>
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-enable.ts' ||
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-disable.ts',
      ),
    ).toBe(false)
  })

  it('keeps preview routes off without visualEditing config', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({injectRoute, updateConfig, injectScript} as never)

    expect(
      injectRoute.mock.calls.some(
        ([route]) =>
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-enable.ts' ||
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-disable.ts',
      ),
    ).toBe(false)
  })

  it('supports visualEditing shorthand with "draftMode"', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      visualEditing: 'draftMode',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/visual-editing/draft-mode-enable.ts',
        pattern: '/preview/enable',
        prerender: false,
      }),
    )
    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/visual-editing/draft-mode-disable.ts',
        pattern: '/preview/disable',
        prerender: false,
      }),
    )
  })

  it('supports visualEditing shorthand with explicit "disabled"', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      visualEditing: 'disabled',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({injectRoute, updateConfig, injectScript} as never)

    expect(
      injectRoute.mock.calls.some(
        ([route]) =>
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-enable.ts' ||
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-disable.ts',
      ),
    ).toBe(false)
  })
})

describe('sanity integration studio router history defaults', () => {
  it('defaults to hash history for static output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({config: {output: 'static'}, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route-hash.astro',
        pattern: '/admin',
        prerender: true,
      }),
    )
  })

  it('defaults to browser history for server output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({config: {output: 'server'}, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })

  it('respects explicit browser history on static output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
      studioRouterHistory: 'browser',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({config: {output: 'static'}, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })
})
