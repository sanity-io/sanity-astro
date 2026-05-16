import type {PartialDeep} from 'type-fest'
import type {PluginOption} from 'vite'
import {createSanityLoaderVirtualModuleSource, type LiveLoadersConfig} from './live/loader-config'

const virtualModuleId = 'sanity:loader'
const resolvedVirtualModuleId = '\0' + virtualModuleId

export function vitePluginSanityLoader(loaders: LiveLoadersConfig | undefined) {
  return {
    name: 'sanity:loader',
    resolveId(id: string) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return createSanityLoaderVirtualModuleSource(loaders)
      }
    },
  } satisfies PartialDeep<PluginOption>
}
