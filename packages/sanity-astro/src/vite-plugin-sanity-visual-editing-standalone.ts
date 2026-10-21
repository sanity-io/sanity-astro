import path from 'node:path'

import type {Plugin, ResolvedConfig} from 'vite'

export const STANDALONE_PACKAGE = '@sanity/visual-editing-standalone'
export const ENABLE_VISUAL_EDITING_SPECIFIER = '@sanity/visual-editing/enable-visual-editing'
export const VIRTUAL_STANDALONE_ID = '\0sanity-astro:visual-editing-standalone'

const VISUAL_EDITING_CLIENT = /[\\/]visual-editing[\\/]client\.[cm]?[jt]s$/

export function isVisualEditingClient(importer: string | undefined): importer is string {
  return !!importer && VISUAL_EDITING_CLIENT.test(importer.split('?')[0])
}

/**
 * `data-astro-transition-persist` value on the overlay stylesheet. An in-place morph keeps
 * `<head>` nodes that carry this attribute and drops every other runtime `<style>`, which is
 * what Vite emits for a plain CSS import from the lazy client chunk.
 */
export const STANDALONE_STYLE_PERSIST_ID = 'sanity-visual-editing-standalone'

export const standaloneModuleSource = [
  `import css from '${STANDALONE_PACKAGE}/styles.css?inline'`,
  `const standaloneStyleId = '${STANDALONE_STYLE_PERSIST_ID}'`,
  `if (typeof document !== 'undefined' && !document.head.querySelector('style[data-astro-transition-persist="' + standaloneStyleId + '"]')) {`,
  `  const style = document.createElement('style')`,
  `  style.setAttribute('data-astro-transition-persist', standaloneStyleId)`,
  `  style.textContent = css`,
  `  document.head.appendChild(style)`,
  `}`,
  `export {enableVisualEditing} from '${STANDALONE_PACKAGE}'`,
  '',
].join('\n')

/**
 * Points the `<VisualEditing />` client at `@sanity/visual-editing-standalone`, which
 * ships its own copy of React and Sanity UI. Only the client's `enableVisualEditing`
 * import is redirected; the deprecated React component and any project imports keep
 * resolving `@sanity/visual-editing`.
 */
export function vitePluginSanityVisualEditingStandalone(): Plugin {
  let root = process.cwd()
  let clientImporter: string | undefined

  return {
    name: 'sanity:visual-editing-standalone',
    enforce: 'pre',
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
  }
}
