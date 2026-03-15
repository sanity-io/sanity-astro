import {describe, expect, it, vi} from 'vitest'
import sanityIntegration from './index'

describe('sanity integration preview routes', () => {
  it('injects preview enable/disable routes when preview mode is configured', () => {
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

    setup({injectRoute, updateConfig, injectScript} as never)

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

  it('injects preview routes when preview mode is enabled without a token', () => {
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

    setup({injectRoute, updateConfig, injectScript} as never)

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

  it('does not inject preview routes when preview mode is disabled', () => {
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

    setup({injectRoute, updateConfig, injectScript} as never)

    expect(
      injectRoute.mock.calls.some(
        ([route]) =>
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-enable.ts' ||
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-disable.ts',
      ),
    ).toBe(false)
  })

  it('keeps preview routes off without visualEditing config', () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    setup({injectRoute, updateConfig, injectScript} as never)

    expect(
      injectRoute.mock.calls.some(
        ([route]) =>
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-enable.ts' ||
          route?.entrypoint === '@sanity/astro/visual-editing/draft-mode-disable.ts',
      ),
    ).toBe(false)
  })
})
