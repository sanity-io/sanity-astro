/**
 * Per-resource query registry, keyed by `"projectId.dataset"`.
 * `sanity typegen generate` fills it in when `typegen.resources` is configured, and
 * `@sanity/client` >= 8.7.0 declares the same global. Declared here so `getClient(name)` can be
 * typed against it with older `@sanity/client` versions and before typegen has run.
 */
interface SanityQueriesByResource {}

declare module 'sanity:client' {
  import type {
    ClientParams,
    ClientReturn,
    FilteredResponseQueryOptions,
    QueryParams,
    QueryWithoutParams,
    RawQueryResponse,
    RawQuerylessQueryResponse,
    SanityClient,
    UnfilteredResponseQueryOptions,
    UnfilteredResponseWithoutQuery,
  } from '@sanity/client'

  /**
   * Client names mapped to their `"projectId.dataset"` resource key.
   * The integration augments this interface from `astro:config:done` with the configured `clients`.
   */
  export interface SanityAstroClients {}

  /** The client marked with `presentation: true`, `default` when none is. */
  export interface SanityAstroPresentationClient {}

  /** Configured client names, or any string until the integration has written its types. */
  export type ClientName = [keyof SanityAstroClients] extends [never]
    ? string
    : keyof SanityAstroClients

  type QueriesFor<Key> = [Key] extends [keyof SanityQueriesByResource]
    ? SanityQueriesByResource[Key]
    : never

  // A branded query (such as a `.groq` import) carries its own result type, which wins over the
  // per-resource registry the same way it wins over `SanityQueries` in `@sanity/client`.
  type ResourceQueryReturn<Queries, Query extends string, Fallback> = Query extends {
    readonly __groqResult?: unknown
  }
    ? ClientReturn<Query, Fallback>
    : Query extends keyof Queries
      ? Queries[Query]
      : Fallback

  /**
   * A `SanityClient` whose `fetch` resolves query result types through a per-resource query
   * registry instead of the flat `SanityQueries` registry. It is still assignable to `SanityClient`.
   */
  export interface TypedSanityClient<Queries> extends SanityClient {
    fetch<
      R = any,
      Q extends QueryWithoutParams = QueryWithoutParams,
      const G extends string = string,
    >(
      query: G,
      params?: Q | QueryWithoutParams,
    ): Promise<ResourceQueryReturn<Queries, G, R>>
    fetch<
      R = any,
      Q extends QueryWithoutParams | QueryParams = QueryParams,
      const G extends string = string,
    >(
      query: G,
      params: Q extends QueryWithoutParams ? QueryWithoutParams : ClientParams<G, Q>,
      options?: FilteredResponseQueryOptions,
    ): Promise<ResourceQueryReturn<Queries, G, R>>
    fetch<
      R = any,
      Q extends QueryWithoutParams | QueryParams = QueryParams,
      const G extends string = string,
    >(
      query: G,
      params: Q extends QueryWithoutParams ? QueryWithoutParams : ClientParams<G, Q>,
      options: UnfilteredResponseQueryOptions,
    ): Promise<RawQueryResponse<ResourceQueryReturn<Queries, G, R>>>
    fetch<
      R = any,
      Q extends QueryWithoutParams | QueryParams = QueryParams,
      const G extends string = string,
    >(
      query: G,
      params: Q extends QueryWithoutParams ? QueryWithoutParams : ClientParams<G, Q>,
      options: UnfilteredResponseWithoutQuery,
    ): Promise<RawQuerylessQueryResponse<ResourceQueryReturn<Queries, G, R>>>
  }

  /**
   * The client type for a resource key: typed per resource when `SanityQueriesByResource` has an
   * entry for it, otherwise a plain `SanityClient` (which still resolves results through the flat
   * `SanityQueries` registry).
   */
  export type ClientForResource<Key> = [QueriesFor<Key>] extends [never]
    ? SanityClient
    : TypedSanityClient<QueriesFor<Key>>

  type ClientFor<Name> = [Name] extends [keyof SanityAstroClients]
    ? ClientForResource<SanityAstroClients[Name]>
    : SanityClient

  type PresentationClientName = SanityAstroPresentationClient extends {name: infer Name}
    ? Name
    : 'default'

  /** The `default` client. */
  export const sanityClient: ClientFor<'default'>

  /**
   * The client marked with `presentation: true` in the `clients` option, the `default` client when
   * none is. For the fetches that feed Presentation / Visual Editing; nothing in the integration
   * reads it. In browser code, a named client configured with a `token` or `headers` is replaced
   * by a stand-in that throws when it is used, and this export is that stand-in when it points at
   * such a client.
   */
  export const presentationClient: ClientFor<PresentationClientName>

  /**
   * Returns the client configured under `clients[name]`. Throws for unknown names. In browser
   * code, a named client configured with a `token` or `headers` is replaced by a stand-in that
   * throws when it is used.
   */
  export function getClient<Name extends ClientName>(name: Name): ClientFor<Name>

  export {}
}

declare module 'sanity:studio' {
  export const config: import('sanity').Config
}

declare module '*.astro' {
  const component: unknown
  export default component
}
