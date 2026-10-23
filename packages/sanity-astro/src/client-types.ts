import type {ResolvedClients} from './resolve-clients'

export const CLIENT_TYPES_FILENAME = 'clients.d.ts'

/**
 * Builds the `.d.ts` the integration injects through Astro's `injectTypes`.
 * It augments `SanityAstroClients` in `sanity:client` with the configured client names,
 * each mapped to its `"projectId.dataset"` key in the `SanityQueriesByResource` registry that
 * `sanity typegen generate` emits for `typegen.resources`. `getClient(name)` resolves its
 * typed `fetch` through that key, or falls back to a plain `SanityClient` when the key is `string`.
 */
export function generateClientTypes({clients, presentationClientName}: ResolvedClients): string {
  const entries = Object.entries(clients).map(([name, {projectId, dataset}]) => {
    const resourceKey =
      typeof projectId === 'string' && typeof dataset === 'string'
        ? JSON.stringify(`${projectId}.${dataset}`)
        : 'string'
    return `    ${JSON.stringify(name)}: ${resourceKey}`
  })

  return [
    '/// <reference types="@sanity/astro/module" />',
    '',
    "declare module 'sanity:client' {",
    '  interface SanityAstroClients {',
    ...entries,
    '  }',
    '  interface SanityAstroPresentationClient {',
    `    name: ${JSON.stringify(presentationClientName)}`,
    '  }',
    '}',
    '',
  ].join('\n')
}
