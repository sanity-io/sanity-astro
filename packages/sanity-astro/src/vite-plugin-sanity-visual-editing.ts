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
  const {token, ...rest} = config
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
          const configuredToken = ${serialize(token)};
          const runtimeToken =
            import.meta.env.SANITY_API_READ_TOKEN ||
            (typeof process !== "undefined" ? process.env?.SANITY_API_READ_TOKEN : undefined);
          export const sanityVisualEditing = {
            ...${serialize(rest)},
            token: configuredToken || runtimeToken
          };
        `
      }
    },
  } satisfies PartialDeep<PluginOption>
}
