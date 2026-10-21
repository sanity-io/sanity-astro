import path from 'node:path'

import type {Plugin, ResolvedConfig} from 'vite'

export const STANDALONE_PACKAGE = '@sanity/visual-editing-standalone'
export const ENABLE_VISUAL_EDITING_SPECIFIER = '@sanity/visual-editing/enable-visual-editing'
export const OPTIMISTIC_PACKAGE = '@sanity/visual-editing/optimistic'
export const VIRTUAL_STANDALONE_ID = '\0sanity-astro:visual-editing-standalone'

const VISUAL_EDITING_CLIENT = /[\\/]visual-editing[\\/]client\.[cm]?[jt]s$/
const STANDALONE_IN_PATH = /[\\/]@sanity[\\/]visual-editing-standalone[\\/]/
const SHARE_ACTOR_HELPER = '__sanityAstroShareOptimisticActor'
/** Minified `useDatasetMutator` hand-off: `e.features.optimistic&&setActor(mutator)`. */
const SET_ACTOR_ON_OPTIMISTIC = /\.features\.optimistic&&(\w+)\((\w+)\)/g

export function isVisualEditingClient(importer: string | undefined): importer is string {
  return !!importer && VISUAL_EDITING_CLIENT.test(importer.split('?')[0])
}

export function isStandalonePackageModule(id: string): boolean {
  return STANDALONE_IN_PATH.test(id.split('?')[0])
}

export const standaloneModuleSource = [
  `import '${STANDALONE_PACKAGE}/styles.css'`,
  `export {enableVisualEditing} from '${STANDALONE_PACKAGE}'`,
  '',
].join('\n')

/**
 * `@sanity/visual-editing-standalone` inlines its own optimistic `actor`. Presentation still
 * calls `setActor` on that copy when `features.optimistic` is on, while `live-text` listens to
 * `@sanity/visual-editing/optimistic`. Mirror that hand-off onto the shared actor so instant
 * text patches, stale HTML detection, and settle-pass morphs keep working.
 */
export function shareOptimisticActorWithLiveText(code: string): string | null {
  if (code.includes(SHARE_ACTOR_HELPER) || !code.includes('features.optimistic')) {
    return null
  }
  SET_ACTOR_ON_OPTIMISTIC.lastIndex = 0
  if (!SET_ACTOR_ON_OPTIMISTIC.test(code)) {
    return null
  }
  SET_ACTOR_ON_OPTIMISTIC.lastIndex = 0
  const next = code.replace(
    SET_ACTOR_ON_OPTIMISTIC,
    `.features.optimistic&&($1($2),${SHARE_ACTOR_HELPER}($2))`,
  )
  if (next === code) {
    return null
  }
  return `import {setActor as ${SHARE_ACTOR_HELPER}} from '${OPTIMISTIC_PACKAGE}';\n${next}`
}

/**
 * Points the `<VisualEditing />` client at `@sanity/visual-editing-standalone`, which
 * ships its own copy of React and Sanity UI. Only the client's `enableVisualEditing`
 * import is redirected; the deprecated React component and any project imports keep
 * resolving `@sanity/visual-editing`. Standalone chunks that call `setActor` are rewritten
 * so `live-text` sees the same mutator through `@sanity/visual-editing/optimistic`.
 */
export function vitePluginSanityVisualEditingStandalone(): Plugin {
  let root = process.cwd()
  let clientImporter: string | undefined

  return {
    name: 'sanity:visual-editing-standalone',
    enforce: 'pre',
    config() {
      // Keep the published chunks as source so `transform` can share the optimistic actor.
      return {
        optimizeDeps: {
          exclude: [STANDALONE_PACKAGE],
        },
      }
    },
    configResolved(config: ResolvedConfig) {
      root = config.root
    },
    async resolveId(id, importer) {
      if (id === ENABLE_VISUAL_EDITING_SPECIFIER && isVisualEditingClient(importer)) {
        clientImporter = importer
        return VIRTUAL_STANDALONE_ID
      }

      if (importer === VIRTUAL_STANDALONE_ID && id.startsWith(STANDALONE_PACKAGE)) {
        const fromProject = await this.resolve(id, path.join(root, 'package.json'), {
          skipSelf: true,
        })
        if (fromProject) return fromProject

        const fromClient = clientImporter
          ? await this.resolve(id, clientImporter, {skipSelf: true})
          : null
        if (fromClient) return fromClient

        throw new Error(
          `[@sanity/astro]: \`visualEditingStandalone\` is enabled but \`${STANDALONE_PACKAGE}\` could not be resolved. Install it with \`npm install ${STANDALONE_PACKAGE}\`.`,
        )
      }

      return null
    },
    load(id) {
      return id === VIRTUAL_STANDALONE_ID ? standaloneModuleSource : null
    },
    transform(code, id) {
      if (!isStandalonePackageModule(id)) {
        return null
      }
      const next = shareOptimisticActorWithLiveText(code)
      return next ? {code: next, map: null} : null
    },
  }
}
