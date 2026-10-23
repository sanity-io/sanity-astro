import {describe, expect, it} from 'vitest'

import {CLIENT_TYPES_FILENAME, generateClientTypes} from './client-types'

describe('generateClientTypes', () => {
  it('writes to a stable filename', () => {
    expect(CLIENT_TYPES_FILENAME).toBe('clients.d.ts')
  })

  it('maps each client to its "projectId.dataset" resource key', () => {
    expect(
      generateClientTypes({
        clients: {
          default: {projectId: 'main', dataset: 'marketing', apiVersion: 'v2023-08-24'},
          community: {projectId: 'community', dataset: 'blog', apiVersion: 'v2023-08-24'},
        },
        presentationClientName: 'community',
      }),
    ).toMatchInlineSnapshot(`
      "/// <reference types="@sanity/astro/module" />

      declare module 'sanity:client' {
        interface SanityAstroClients {
          "default": "main.marketing"
          "community": "community.blog"
        }
        interface SanityAstroPresentationClient {
          name: "community"
        }
      }
      "
    `)
  })

  it('falls back to string for clients without a projectId and dataset', () => {
    const types = generateClientTypes({
      clients: {default: {apiVersion: 'v2023-08-24'}, partial: {projectId: 'only-project'}},
      presentationClientName: 'default',
    })

    expect(types).toContain('"default": string')
    expect(types).toContain('"partial": string')
  })

  it('escapes client names and resource keys', () => {
    const types = generateClientTypes({
      clients: {'default': {}, 'we"ird': {projectId: 'p"id', dataset: 'd"s'}},
      presentationClientName: 'default',
    })

    expect(types).toContain(String.raw`"we\"ird": "p\"id.d\"s"`)
  })
})
