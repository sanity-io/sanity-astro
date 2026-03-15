import type {PartialDeep} from 'type-fest'
import serialize from 'serialize-javascript'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:visual-editing'
const resolvedVirtualModuleId = '\0' + virtualModuleId

export interface SanityVisualEditingConfig {
  previewMode: false | {enable: string; disable: string; cookie: string}
  previewModeId?: string
  token?: string
}

export function vitePluginSanityVisualEditing(config: SanityVisualEditingConfig) {
  return {
    name: 'sanity:visual-editing',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return `
          export const sanityVisualEditing = ${serialize(config)};
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}
