import type {ClientConfig} from '@sanity/client'

export const DEFAULT_CLIENT_NAME = 'default'

export type NamedClientConfig = ClientConfig & {
  /**
   * Exports this client from `sanity:client` as `presentationClient`, for the code that feeds
   * Presentation / Visual Editing. The integration does not wire those features itself.
   * At most one client can set this; it defaults to the `default` client.
   */
  presentation?: boolean
}

export type ResolvedClients = {
  /** Client configs ready for `createClient`, keyed by name. Always contains `default`. */
  clients: Record<string, ClientConfig>
  presentationClientName: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function resolveClientConfigs({
  clientConfig,
  clients,
  defaults,
}: {
  /** The top-level `ClientConfig` options passed to the integration (integration-only keys already removed). */
  clientConfig: ClientConfig
  clients: Record<string, NamedClientConfig> | undefined
  defaults: ClientConfig
}): ResolvedClients {
  if (clients === undefined) {
    return {
      clients: {[DEFAULT_CLIENT_NAME]: {...defaults, ...clientConfig}},
      presentationClientName: DEFAULT_CLIENT_NAME,
    }
  }

  if (!isPlainObject(clients)) {
    throw new Error(
      '[@sanity/astro]: The `clients` option must be an object mapping client names to client configs',
    )
  }

  const hasTopLevelClientConfig = Object.keys(clientConfig).length > 0
  const namedClients: Record<string, NamedClientConfig> = {...clients}

  if (hasTopLevelClientConfig) {
    if (DEFAULT_CLIENT_NAME in namedClients) {
      throw new Error(
        '[@sanity/astro]: Top-level client options and `clients.default` can not be combined. Move the top-level options into `clients.default`',
      )
    }
    namedClients[DEFAULT_CLIENT_NAME] = clientConfig
  }

  if (!(DEFAULT_CLIENT_NAME in namedClients)) {
    throw new Error(
      '[@sanity/astro]: `clients.default` is required when using the `clients` option, it is the client exported as `sanityClient`. Add it to `clients` or configure it with the top-level client options',
    )
  }

  // No prototype, so a client named `__proto__` is stored instead of changing the prototype
  const resolved: Record<string, ClientConfig> = Object.create(null)
  const presentationClientNames: string[] = []

  for (const [name, namedClient] of Object.entries(namedClients)) {
    if (name.trim() === '') {
      throw new Error('[@sanity/astro]: Client names in `clients` must be non-empty strings')
    }
    if (!isPlainObject(namedClient)) {
      throw new Error(`[@sanity/astro]: The config for client "${name}" must be an object`)
    }

    const {presentation, ...config} = namedClient
    if (presentation === true) {
      presentationClientNames.push(name)
    }
    resolved[name] = {...defaults, ...config}
  }

  if (presentationClientNames.length > 1) {
    throw new Error(
      `[@sanity/astro]: Only one client can set \`presentation: true\`, found it on: ${presentationClientNames
        .map((name) => `"${name}"`)
        .join(', ')}`,
    )
  }

  return {
    clients: resolved,
    presentationClientName: presentationClientNames[0] ?? DEFAULT_CLIENT_NAME,
  }
}
