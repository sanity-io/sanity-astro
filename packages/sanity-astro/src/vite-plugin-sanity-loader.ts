import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'

const virtualModuleId = 'sanity:loader'
export const SANITY_LOADER_MODULE_ID = '\0' + virtualModuleId

export interface SanityLoaderModuleHost {
  readonly module: {readonly runtime: string}
}

export function vitePluginSanityLoader(host: SanityLoaderModuleHost) {
  return {
    name: 'sanity:loader',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return SANITY_LOADER_MODULE_ID
      }
    },
    load(id: string) {
      if (id === SANITY_LOADER_MODULE_ID) {
        return host.module.runtime
      }
    },
  } satisfies PartialDeep<PluginOption>
}
